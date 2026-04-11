import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { safeParseJsonResponse } from '@/shared/utils/safe-parse-json'
import {
  isAllowedFacebookCallbackRedirect,
  resolveFacebookOAuthRedirectUri,
} from '@/lib/facebook-oauth-redirect'

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

    const appId = process.env.FACEBOOK_APP_ID
    const appSecret = process.env.FACEBOOK_APP_SECRET

    if (!appId || !appSecret) {
      return NextResponse.redirect(
        new URL('/settings?error=facebook_not_configured&integration=facebook', request.url)
      )
    }

    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`,
      { method: 'GET' }
    )

    const tokenParsed = await safeParseJsonResponse<{
      access_token?: string
      expires_in?: number
      error?: { message?: string; type?: string; code?: number }
    }>(tokenResponse)

    if (!tokenResponse.ok) {
      const fbError = tokenParsed.ok ? tokenParsed.data?.error : null
      console.error(
        'Facebook token exchange HTTP error:',
        tokenResponse.status,
        fbError ?? (tokenParsed.ok ? tokenParsed.data : tokenParsed.error)
      )
      return NextResponse.redirect(
        new URL('/settings?error=token_exchange_failed&integration=facebook', request.url)
      )
    }
    if (!tokenParsed.ok) {
      console.error('Facebook token exchange parse error:', tokenParsed.error)
      return NextResponse.redirect(
        new URL('/settings?error=token_exchange_failed&integration=facebook', request.url)
      )
    }

    const tokenBody = tokenParsed.data
    if (tokenBody.error) {
      console.error('Facebook token exchange API error:', tokenBody.error.message ?? tokenBody.error)
      return NextResponse.redirect(
        new URL('/settings?error=token_exchange_failed&integration=facebook', request.url)
      )
    }
    if (!tokenBody.access_token) {
      return NextResponse.redirect(
        new URL('/settings?error=no_access_token&integration=facebook', request.url)
      )
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

    // Check if connection already exists
    const { data: existingData } = await supabase
      .from('facebook_business_settings')
      .select('id')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .maybeSingle()
    const existing = existingData as { id: string } | null

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
    } else {
      // Create new connection
      const { error: insertError } = await supabase
        .from('facebook_business_settings')
        .insert(settingsData as any)

      if (insertError) {
        console.error('Error saving Facebook settings:', insertError)
        return NextResponse.redirect(
          new URL('/settings?error=save_failed&integration=facebook', request.url)
        )
      }
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
