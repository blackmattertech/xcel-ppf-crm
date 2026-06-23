import { NextRequest, NextResponse } from 'next/server'
import { isExternalCronAuthorized } from '@/lib/cron-request-auth'
import { runTemplateSync } from '@/backend/jobs/whatsapp-template-sync.job'

/**
 * Cron: sync WhatsApp template status/category from Meta (FastCron hourly).
 * Secure with Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!isExternalCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runTemplateSync()
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Sync failed', errors: result.errors },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, synced: result.synced, errors: result.errors })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
