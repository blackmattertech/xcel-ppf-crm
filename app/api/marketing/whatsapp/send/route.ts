import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { sendWhatsAppBulk, sendWhatsAppText } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { saveOutgoingMessage } from '@/backend/services/whatsapp-chat.service'
import { z } from 'zod'

const sendSchema = z.object({
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(100),
  message: z.string().min(1).max(4096),
  defaultCountryCode: z.string().max(4).optional().default('91'),
  leadId: z.string().uuid().optional(),
  /** WhatsApp message ID (wamid) to reply to – sends as contextual reply. */
  contextMessageId: z.string().min(1).optional(),
})

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { config } = await getResolvedWhatsAppConfig(user.id)
  if (!config) {
    return NextResponse.json(
      {
        error: 'WhatsApp API not configured',
        detail: 'Link WhatsApp in Settings → Integrations, or set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env.local.',
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

  const { recipients, message, defaultCountryCode, leadId, contextMessageId } = parsed.data

  if (recipients.length === 1 && leadId) {
    const r = recipients[0]
    const result = await sendWhatsAppText(r.phone, message, config, contextMessageId ?? null)
    if (result.success) {
      const saveResult = await saveOutgoingMessage({
        leadId,
        phone: r.phone,
        body: message,
        metaMessageId: result.messageId ?? undefined,
      })
      if (!saveResult.success) {
        console.warn('[whatsapp/send] Save failed:', saveResult.errorCode, saveResult.errorMessage)
      }
      return NextResponse.json({
        sent: 1,
        failed: 0,
        results: [{ phone: r.phone, success: true }],
        message: saveResult.success ? saveResult.data : undefined,
        saveFailed: !saveResult.success,
        saveErrorCode: saveResult.success ? undefined : saveResult.errorCode,
        saveErrorMessage: saveResult.success ? undefined : saveResult.errorMessage,
      })
    }
    return NextResponse.json({
      sent: 0,
      failed: 1,
      results: [{ phone: r.phone, success: false, error: result.error }],
    })
  }

  const result = await sendWhatsAppBulk(
    recipients.map((r) => ({ phone: r.phone })),
    message,
    { delayMs: 250, defaultCountryCode, config }
  )

  let anySaveFailed = false
  let lastSaveError: { code?: string; message?: string } | undefined
  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i]
    if (r.success) {
      const recipient = recipients[i]
      const saveResult = await saveOutgoingMessage({
        leadId: null,
        phone: recipient?.phone ?? r.phone,
        body: message,
        metaMessageId: r.messageId ?? undefined,
      })
      if (!saveResult.success) {
        anySaveFailed = true
        lastSaveError = { code: saveResult.errorCode, message: saveResult.errorMessage }
      }
    }
  }

  return NextResponse.json({
    sent: result.sent,
    failed: result.failed,
    results: result.results,
    saveFailed: anySaveFailed,
    saveErrorCode: lastSaveError?.code,
    saveErrorMessage: lastSaveError?.message,
  })
}
