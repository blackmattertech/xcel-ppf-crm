import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { safeParseJsonResponse } from '@/shared/utils/safe-parse-json'

/**
 * GET /api/integrations/facebook/ad-accounts
 * List ad accounts the user has access to (for changing ad account)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const supabase = createServiceClient()

    const { data: rows, error } = await supabase
      .from('facebook_business_settings')
      .select('access_token, expires_at')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    const data = rows?.[0] ?? null
    if (error || !data) {
      return NextResponse.json(
        { error: 'Facebook Business account not connected.' },
        { status: 404 }
      )
    }

    const settings = data as { access_token: string; expires_at: string | null }
    if (settings.expires_at && new Date(settings.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Facebook access token expired. Please reconnect.' },
        { status: 401 }
      )
    }

    const res = await fetch(
      `https://graph.facebook.com/v25.0/me/adaccounts?access_token=${encodeURIComponent(settings.access_token)}&fields=id,name,account_id`
    )
    const parsed = await safeParseJsonResponse<{
      data?: Array<{ id: string; name: string; account_id?: string }>
      error?: { message?: string }
    }>(res)

    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error || 'Failed to fetch ad accounts' },
        { status: 500 }
      )
    }

    if (parsed.data?.error) {
      return NextResponse.json(
        { error: parsed.data.error.message || 'Meta API error' },
        { status: 400 }
      )
    }

    const adAccounts = parsed.data?.data ?? []
    return NextResponse.json({ adAccounts })
  } catch (error) {
    console.error('Facebook ad-accounts error:', error)
    return NextResponse.json(
      { error: 'Failed to load ad accounts' },
      { status: 500 }
    )
  }
}
