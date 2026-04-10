import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { safeParseJsonResponse } from '@/shared/utils/safe-parse-json'
import {
  isAllowedFacebookCallbackRedirect,
  resolveFacebookOAuthRedirectUri,
} from '@/lib/facebook-oauth-redirect'

type FbOAuthErrorBody = {
  access_token?: string
  expires_in?: number
  error?: { message?: string; type?: string; code?: number; error_subcode?: number }
}

function redirectFacebookSettingsError(
  request: NextRequest,
  code: string,
  detail?: string
): NextResponse {
  const u = new URL('/settings', request.url)
  u.searchParams.set('error', code)
  u.searchParams.set('integration', 'facebook')
  if (detail) {
    u.searchParams.set('detail', detail.slice(0, 400))
  }
  return NextResponse.redirect(u)
}

/**
 * GET /api/integrations/facebook/callback
 * Handles Facebook OAuth callback and stores access token
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      // Redirect to login if not authenticated
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { user } = authResult
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(
        new URL(`/settings?error=${encodeURIComponent(error)}&integration=facebook`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/settings?error=missing_code_or_state&integration=facebook', request.url)
      )
    }

    // Decode state to get userId and redirectUri (must match authorize URL byte-for-byte)
    let stateData: { userId: string; redirectUri?: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    } catch {
      return NextResponse.redirect(
        new URL('/settings?error=invalid_state&integration=facebook', request.url)
      )
    }

    if (!stateData.userId || stateData.userId !== user.id) {
      return NextResponse.redirect(
        new URL('/settings?error=invalid_state&integration=facebook', request.url)
      )
    }

    const fallbackRedirect = resolveFacebookOAuthRedirectUri(request)
    const redirectUri =
      stateData.redirectUri && isAllowedFacebookCallbackRedirect(stateData.redirectUri)
        ? stateData.redirectUri
        : fallbackRedirect

    const appId = process.env.FACEBOOK_APP_ID?.trim()
    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim()

    if (!appId || !appSecret) {
      return redirectFacebookSettingsError(request, 'facebook_not_configured')
    }

    // POST keeps client_secret out of access logs and avoids broken GET URLs for long codes / special chars.
    const tokenResponse = await fetch('https://graph.facebook.com/v25.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    })

    const tokenParsed = await safeParseJsonResponse<FbOAuthErrorBody>(tokenResponse)

    const metaErrMsg = (e: FbOAuthErrorBody['error']): string | undefined => {
      if (!e) return undefined
      if (typeof e === 'object' && e.message) return e.message
      return String(e)
    }

    if (!tokenParsed.ok) {
      console.error('Facebook token exchange parse error:', tokenParsed.error)
      return redirectFacebookSettingsError(request, 'token_exchange_failed', tokenParsed.error)
    }

    const tokenBody = tokenParsed.data
    if (tokenBody.error) {
      const msg = metaErrMsg(tokenBody.error)
      console.error('Facebook token exchange API error:', tokenBody.error)
      return redirectFacebookSettingsError(request, 'token_exchange_failed', msg)
    }

    if (!tokenResponse.ok) {
      console.error(
        'Facebook token exchange HTTP error:',
        tokenResponse.status,
        tokenBody.error ?? tokenBody
      )
      return redirectFacebookSettingsError(
        request,
        'token_exchange_failed',
        metaErrMsg(tokenBody.error) ?? `HTTP ${tokenResponse.status}`
      )
    }

    if (!tokenBody.access_token) {
      return redirectFacebookSettingsError(request, 'no_access_token')
    }

    const tokenData = tokenBody
    const accessToken = tokenData.access_token!

    // Get token expiration
    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

    // Fetch user's pages (with Page Access Token for each) and ad accounts
    const [pagesResponse, adAccountsResponse] = await Promise.all([
      fetch(`https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`),
      fetch(`https://graph.facebook.com/v25.0/me/adaccounts?access_token=${encodeURIComponent(accessToken)}&fields=id,name,account_id`),
    ])

    let pageId: string | null = null
    let pageName: string | null = null
    /** Page Access Token – required for leadgen API; User token cannot be used for /page/leadgen_forms or /form/leads */
    let pageAccessToken: string | null = null

    let adAccountId: string | null = null
    let adAccountName: string | null = null
    let businessId: string | null = null
    let businessName: string | null = null

    if (pagesResponse.ok) {
      const pagesParsed = await safeParseJsonResponse<{ data?: Array<{ id: string; name: string; access_token?: string }> }>(pagesResponse)
      if (pagesParsed.ok && pagesParsed.data?.data?.length) {
        const firstPage = pagesParsed.data.data[0]
        pageId = firstPage.id
        pageName = firstPage.name
        pageAccessToken = firstPage.access_token || null
      }
    }

    if (adAccountsResponse.ok) {
      const adAccountsParsed = await safeParseJsonResponse<{ data?: Array<{ id: string; name: string }> }>(adAccountsResponse)
      if (adAccountsParsed.ok && adAccountsParsed.data?.data?.length) {
        adAccountId = adAccountsParsed.data.data[0].id
        adAccountName = adAccountsParsed.data.data[0].name
      }
    }

    // Get business info if available
    if (adAccountId) {
      try {
        const businessResponse = await fetch(
          `https://graph.facebook.com/v25.0/${adAccountId}?access_token=${accessToken}&fields=business`
        )
        if (businessResponse.ok) {
          const businessParsed = await safeParseJsonResponse<{ business?: { id: string } }>(businessResponse)
          if (businessParsed.ok && businessParsed.data?.business) {
            businessId = businessParsed.data.business.id
            const businessInfoResponse = await fetch(
              `https://graph.facebook.com/v25.0/${businessId}?access_token=${accessToken}&fields=name`
            )
            if (businessInfoResponse.ok) {
              const businessInfoParsed = await safeParseJsonResponse<{ name?: string }>(businessInfoResponse)
              if (businessInfoParsed.ok && businessInfoParsed.data?.name) {
                businessName = businessInfoParsed.data.name
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching business info:', error)
      }
    }

    // Store or update Facebook Business settings
    const supabase = createServiceClient()

    // Latest active row only (avoid .maybeSingle() when duplicates exist — it errors and led to extra inserts).
    const { data: existingRows, error: existingLookupError } = await supabase
      .from('facebook_business_settings')
      .select('id')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (existingLookupError) {
      console.error('Error looking up Facebook settings:', existingLookupError)
      return NextResponse.redirect(
        new URL('/settings?error=save_failed&integration=facebook', request.url)
      )
    }

    const existing = (existingRows?.[0] ?? null) as { id: string } | null

    const settingsData = {
      access_token: accessToken,
      page_access_token: pageAccessToken,
      page_id: pageId,
      page_name: pageName,
      ad_account_id: adAccountId,
      ad_account_name: adAccountName,
      business_id: businessId,
      business_name: businessName,
      expires_at: expiresAt,
      is_active: true,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }

    let savedId: string

    if (existing) {
      // Update existing connection (Supabase infers 'never' for untyped table)
      const { error: updateError } = await supabase
        .from('facebook_business_settings')
        // @ts-expect-error - facebook_business_settings Update type not inferred correctly
        .update(settingsData)
        .eq('id', existing.id)

      if (updateError) {
        console.error('Error updating Facebook settings:', updateError)
        return NextResponse.redirect(
          new URL('/settings?error=update_failed&integration=facebook', request.url)
        )
      }
      savedId = existing.id
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('facebook_business_settings')
        .insert(settingsData as any)
        .select('id')
        .single()

      if (insertError || !inserted) {
        console.error('Error saving Facebook settings:', insertError)
        return NextResponse.redirect(
          new URL('/settings?error=save_failed&integration=facebook', request.url)
        )
      }
      savedId = (inserted as { id: string }).id
    }

    // Deactivate older duplicate rows so GET and future OAuth runs stay consistent
    const { error: dedupeError } = await supabase
      .from('facebook_business_settings')
      // @ts-expect-error - facebook_business_settings Update type not inferred correctly
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('created_by', user.id)
      .neq('id', savedId)
      .eq('is_active', true)

    if (dedupeError) {
      console.error('Error deactivating duplicate Facebook settings:', dedupeError)
    }

    // Redirect to settings page with success message
    return NextResponse.redirect(
      new URL('/settings?success=facebook_connected&integration=facebook', request.url)
    )
  } catch (error) {
    console.error('Facebook callback error:', error)
    return NextResponse.redirect(
      new URL('/settings?error=callback_failed&integration=facebook', request.url)
    )
  }
}
