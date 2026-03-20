import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { sendTemplateBulk } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { saveOutgoingMessage } from '@/backend/services/whatsapp-chat.service'
import { resolveBroadcastPayload, BroadcastValidationError } from '@/backend/services/whatsapp-broadcast-resolve'
import { z } from 'zod'

const sendSchema = z.object({
  templateId: z.string().uuid().optional(),
  templateName: z.string().min(1).optional(),
  templateLanguage: z.string().optional().default('en'),
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(100),
  bodyParameters: z.array(z.string()).optional(),
  headerParameters: z.array(z.string()).optional(),
  defaultCountryCode: z.string().max(4).optional().default('91'),
  delayMs: z.number().min(0).max(60000).optional(),
})

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { config, wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!config || !wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp API not configured. Link in Settings → Integrations or set env vars.' },
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

  let payload
  try {
    payload = await resolveBroadcastPayload(parsed.data, wabaConfig)
  } catch (err) {
    if (err instanceof BroadcastValidationError) {
      return NextResponse.json(err.body, { status: err.statusCode })
    }
    throw err
  }

  const result = await sendTemplateBulk(
    payload.recipients,
    payload.templateName,
    payload.templateLanguage,
    {
      delayMs: payload.delayMs,
      defaultCountryCode: payload.defaultCountryCode,
      headerParameters: payload.headerParameters,
      headerFormat: payload.headerFormat,
      headerMediaId: payload.headerMediaId ?? undefined,
      config,
    }
  )

  const bodyForChat = `[Template: ${payload.templateName}]`
  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i]
    if (r.success) {
      const recipient = payload.recipients[i]
      await saveOutgoingMessage({
        leadId: null,
        phone: recipient?.phone ?? r.phone,
        body: bodyForChat,
        metaMessageId: r.messageId ?? undefined,
      })
    }
  }

  return NextResponse.json({
    sent: result.sent,
    failed: result.failed,
    results: result.results,
  })
}
