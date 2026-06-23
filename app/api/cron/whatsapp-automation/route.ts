import { NextRequest, NextResponse } from 'next/server'
import { isProcessScheduledCronAuthorized } from '@/lib/cron-request-auth'
import { runWhatsAppAutomationJob } from '@/backend/jobs/whatsapp-automation.job'

/**
 * FastCron entrypoint for WhatsApp automation batches (every 15 minutes recommended).
 * Schedule: every 15 minutes recommended (cron: star-slash-15 star star star star).
 */
export async function GET(request: NextRequest) {
  if (!isProcessScheduledCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runWhatsAppAutomationJob()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Automation job failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
