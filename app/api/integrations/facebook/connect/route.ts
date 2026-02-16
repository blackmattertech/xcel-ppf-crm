import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

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
    const redirectUri = searchParams.get('redirect_uri') || `${request.nextUrl.origin}/api/integrations/facebook/callback`

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

    // Facebook OAuth URL with required permissions (leads_retrieval for syncing leads from Meta)
    const scopes = [
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_read_user_content',
      'business_management',
      'ads_read',
      'ads_management',
      'leads_retrieval',
    ].join(',')

    const facebookAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${encodeURIComponent(state)}&response_type=code`

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
