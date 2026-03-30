import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { sendWhatsAppBulk, sendWhatsAppMedia, sendWhatsAppText } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { saveOutgoingMessage } from '@/backend/services/whatsapp-chat.service'
import { z } from 'zod'

const sendSchema = z.object({
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(100),
  message: z.string().max(4096).optional().default(''),
  defaultCountryCode: z.string().max(4).optional().default('91'),
  leadId: z.string().uuid().optional(),
  /** WhatsApp message ID (wamid) to reply to – sends as contextual reply. */
  contextMessageId: z.string().min(1).optional(),
  messageType: z.enum(['text', 'image', 'video', 'document']).optional().default('text'),
  attachment: z.object({
    url: z.string().url(),
    mimeType: z.string().optional(),
    fileName: z.string().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    thumbnailUrl: z.string().url().optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (value.messageType === 'text' && !value.message.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'message is required for text messages',
      path: ['message'],
    })
  }
  if (value.messageType !== 'text' && !value.attachment?.url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'attachment.url is required for non-text messages',
      path: ['attachment', 'url'],
    })
  }
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

  const { recipients, message, defaultCountryCode, leadId, contextMessageId, messageType, attachment } = parsed.data
  const attachmentsEnabled = process.env.INBOX_ATTACHMENTS_ENABLED === 'true'
  if (messageType !== 'text' && !attachment?.url) {
    return NextResponse.json(
      { error: 'attachment.url is required for non-text messages' },
      { status: 400 }
    )
  }
  if (messageType !== 'text' && !attachmentsEnabled) {
    return NextResponse.json(
      { error: 'Attachments are currently disabled by feature flag' },
      { status: 403 }
    )
  }

  /** Single-thread inbox send: text/media with optional reply context; works with or without leadId. */
  if (recipients.length === 1) {
    const r = recipients[0]
    const mediaCaption =
      message.trim() || (attachment?.fileName?.trim() ?? '') || (messageType !== 'text' ? 'Document' : '')
    const bodyForHistory = message.trim() || (messageType !== 'text' ? mediaCaption : '')
    const result = messageType === 'text'
      ? await sendWhatsAppText(r.phone, message, config, contextMessageId ?? null)
      : await sendWhatsAppMedia(
          r.phone,
          {
            mediaType: messageType,
            mediaUrl: attachment?.url ?? '',
            fileName: attachment?.fileName,
            caption: mediaCaption,
            contextMessageId: contextMessageId ?? null,
          },
          config
        )
    if (result.success) {
      const saveResult = await saveOutgoingMessage({
        leadId: leadId ?? null,
        phone: r.phone,
        body: bodyForHistory,
        metaMessageId: result.messageId ?? undefined,
        messageType,
        attachmentUrl: attachment?.url,
        attachmentMimeType: attachment?.mimeType,
        attachmentFileName: attachment?.fileName,
        attachmentSizeBytes: attachment?.sizeBytes,
        thumbnailUrl: attachment?.thumbnailUrl,
        replyToMetaMessageId: contextMessageId ?? null,
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
        messageType: 'text',
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
