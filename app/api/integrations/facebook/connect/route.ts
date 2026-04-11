import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { resolveFacebookOAuthRedirectUri } from '@/lib/facebook-oauth-redirect'

/**
 * GET /api/integrations/facebook/connect
 * Initiates Facebook OAuth flow by redirecting to Facebook login
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const searchParams = request.nextUrl.searchParams
    const redirectUri =
      searchParams.get('redirect_uri') || resolveFacebookOAuthRedirectUri(request)

    // Facebook OAuth configuration
    const appId = process.env.FACEBOOK_APP_ID
    const appSecret = process.env.FACEBOOK_APP_SECRET

    if (!appId?.trim() || !appSecret?.trim()) {
      return NextResponse.json(
        {
          error: 'Facebook integration is not configured',
          code: 'FACEBOOK_NOT_CONFIGURED',
          detail: 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env.local (see Settings → Integrations).',
        },
        { status: 503 }
      )
    }

    // Generate state parameter for CSRF protection
    const state = Buffer.from(JSON.stringify({ userId: user.id, redirectUri })).toString('base64')

    // Facebook OAuth URL – scopes match Meta Permissions Reference; leads_retrieval requires pages_manage_ads
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_manage_ads',
      'business_management',
      'ads_read',
      'ads_management',
      'leads_retrieval',
    ].join(',')

    const facebookAuthUrl = `https://www.facebook.com/v25.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${encodeURIComponent(state)}&response_type=code`

    return NextResponse.json({ authUrl: facebookAuthUrl })
  } catch (error) {
    console.error('Facebook connect error:', error)
    const message = error instanceof Error ? error.message : 'Failed to initiate Facebook connection'
    return NextResponse.json(
      {
        error: 'Failed to initiate Facebook connection',
        detail: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 }
    )
  }
}
