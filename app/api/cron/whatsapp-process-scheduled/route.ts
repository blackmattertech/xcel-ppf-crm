import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.WHATSAPP_PROCESS_SCHEDULED_SECRET || process.env.CRON_SECRET

/**
 * Cron entrypoint for due WhatsApp scheduled broadcasts (e.g. GitHub Actions every 5 min, UTC).
 * Call with Authorization: Bearer CRON_SECRET (or rely on x-vercel-cron on Vercel).
 * Set CRON_SECRET (or WHATSAPP_PROCESS_SCHEDULED_SECRET) in env.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const hasValidBearer = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`

  if (!isVercelCron && !hasValidBearer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const origin = new URL(request.url).origin
  const url = `${origin}/api/marketing/whatsapp/process-scheduled?secret=${encodeURIComponent(CRON_SECRET ?? '')}`

  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to process scheduled jobs' },
      { status: 502 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

