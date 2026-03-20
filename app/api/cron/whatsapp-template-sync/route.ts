import { NextRequest, NextResponse } from 'next/server'
import { runTemplateSync } from '@/backend/jobs/whatsapp-template-sync.job'

/**
 * Cron: sync WhatsApp template status/category from Meta.
 * Secure with CRON_SECRET or Authorization header if needed.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
