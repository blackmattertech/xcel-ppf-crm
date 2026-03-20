import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncMetaLeadsForUser } from '@/backend/jobs/meta-leads-sync.job'

/**
 * Cron: pull Meta Lead Ads for every user with an active Facebook Page connection.
 * Secure with Authorization: Bearer CRON_SECRET (same pattern as whatsapp-template-sync).
 *
 * GitHub Actions: schedule every 6h and GET this URL with secrets APP_BASE_URL + CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: rows, error } = await supabase
    .from('facebook_business_settings')
    .select('created_by')
    .eq('is_active', true)
    .not('page_id', 'is', null)

  if (error) {
    console.error('[cron meta-leads-sync] facebook_business_settings query:', error)
    return NextResponse.json({ error: 'Failed to list Facebook connections' }, { status: 500 })
  }

  const userIds = [...new Set((rows || []).map((r) => (r as { created_by: string }).created_by).filter(Boolean))]

  const results: Array<{
    userId: string
    synced: number
    skipped: number
    failed: number
    message: string
  }> = []
  const errors: Array<{ userId: string; error: string }> = []

  for (const userId of userIds) {
    const out = await syncMetaLeadsForUser(userId)
    if (out.ok) {
      results.push({
        userId,
        synced: out.synced,
        skipped: out.skipped,
        failed: out.failed,
        message: out.message,
      })
    } else {
      errors.push({ userId, error: out.error })
    }
  }

  const anyFailure = errors.length > 0
  return NextResponse.json(
    {
      ok: !anyFailure || results.length > 0,
      usersProcessed: userIds.length,
      results,
      errors,
    },
    { status: anyFailure && results.length === 0 ? 500 : 200 }
  )
}

export async function POST(request: NextRequest) {
  return GET(request)
}
