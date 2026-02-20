import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { sendWhatsAppBulk, getWhatsAppConfig } from '@/backend/services/whatsapp.service'
import { z } from 'zod'

const sendSchema = z.object({
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(100),
  message: z.string().min(1).max(4096),
  defaultCountryCode: z.string().max(4).optional().default('91'),
})

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const config = getWhatsAppConfig()
  if (!config) {
    return NextResponse.json(
      {
        error: 'WhatsApp API not configured',
        detail: 'Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in environment (e.g. .env.local).',
      },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { recipients, message, defaultCountryCode } = parsed.data

  const result = await sendWhatsAppBulk(
    recipients.map((r) => ({ phone: r.phone })),
    message,
    { delayMs: 250, defaultCountryCode }
  )

  return NextResponse.json({
    sent: result.sent,
    failed: result.failed,
    results: result.results,
  })
}
