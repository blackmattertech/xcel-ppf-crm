import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { runWhatsAppAutomationJob } from '@/backend/jobs/whatsapp-automation.job'

function cronSecrets(): string[] {
  const a = process.env.WHATSAPP_PROCESS_SCHEDULED_SECRET?.trim()
  const b = process.env.CRON_SECRET?.trim()
  return [a, b].filter(Boolean) as string[]
}

/**
 * Process due automation trigger batches (manual or cron with ?secret=).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const secrets = cronSecrets()
  const allowedBySecret = !!secret && secrets.length > 0 && secrets.includes(secret.trim())

  if (!allowedBySecret) {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
  }

  try {
    const result = await runWhatsAppAutomationJob()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Automation processing failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
