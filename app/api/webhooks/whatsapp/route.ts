import { NextRequest, NextResponse } from 'next/server'
import { saveIncomingMessage, updateMessageStatus } from '@/backend/services/whatsapp-chat.service'
import { markMessageAsRead } from '@/backend/services/whatsapp.service'
import { getWhatsAppConfigByWabaId } from '@/backend/services/whatsapp-config.service'
import { getWhatsAppConfig } from '@/backend/services/whatsapp.service'
import { processTemplateWebhook } from '@/backend/services/whatsapp-template-webhook.service'
import { createServiceClient } from '@/lib/supabase/service'

/** Meta WhatsApp webhook: GET for verification, POST for incoming messages, status updates, and template events. */

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length > 10 ? d : '91' + d.slice(-10)
}

type StatusValue = 'sent' | 'delivered' | 'read' | 'failed'

/** Meta may send `played` for some media (e.g. voice) — treat as read for CRM display. */
function mapWebhookStatusToMessageStatus(raw: string): StatusValue | null {
  const s = String(raw ?? '').toLowerCase().trim()
  if (s === 'failed') return 'failed'
  if (s === 'played') return 'read'
  if (s === 'sent' || s === 'delivered' || s === 'read') return s
  return null
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'whatsapp_verify'
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Invalid verification' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      object?: string
      entry?: Array<{
        id?: string
        changes?: Array<{
          field?: string
          value?: {
            messages?: Array<{
              from: string
              id: string
              timestamp: string
              type: string
              text?: { body: string }
              image?: { id?: string; mime_type?: string; caption?: string; sha256?: string }
              video?: { id?: string; mime_type?: string; caption?: string; sha256?: string }
              document?: { id?: string; mime_type?: string; filename?: string; caption?: string; sha256?: string }
            }>
            statuses?: Array<{
              id: string
              status: string
              recipient_id?: string
              timestamp: string
              errors?: Array<{ code: number; title: string; message?: string }>
            }>
            event?: string
            message_template_id?: string
            template_id?: string
            status?: string
            rejection_reason?: string
            correct_category?: string
          }
        }>
      }>
    }
    if (body.object !== 'whatsapp_business_account' || !body.entry?.length) {
      return NextResponse.json({ ok: true })
    }

    for (const entry of body.entry) {
      const wabaId = entry.id ?? ''
      const waConfig = wabaId ? await getWhatsAppConfigByWabaId(wabaId) : null
      const config = waConfig ?? getWhatsAppConfig()
      const changes = entry.changes ?? []
      for (const change of changes) {
        const value = change.value
        if (!value) continue

        // Template status/category updates (message_templates field)
        if (change.field === 'message_templates' && value.event) {
          const eventType = (value.event as string) || 'message_template_status_update'
          processTemplateWebhook({
            wabaId,
            eventType,
            payload: value as Record<string, unknown>,
          }).catch((err) => console.warn('[webhooks/whatsapp] processTemplateWebhook failed:', err))
          continue
        }

        // Handle status updates (sent, delivered, read, failed)
        const statuses = value.statuses ?? []
        for (const st of statuses) {
          const wamid = String(st.id ?? '').trim()
          if (!wamid) continue
          const mapped = mapWebhookStatusToMessageStatus(String(st.status ?? ''))
          if (mapped === 'failed') {
            const errs = (st as { errors?: Array<{ code: number; title: string; message?: string }> }).errors ?? []
            console.error('[webhooks/whatsapp] Message delivery FAILED:', {
              messageId: wamid,
              recipientId: st.recipient_id,
              errors: errs,
              hint: 'Common: 131047=user not opted in / 24h window closed, 131026=template rejected, 131031=recipient blocked',
            })
            updateMessageStatus(wamid, 'failed').catch((err) =>
              console.warn('[webhooks/whatsapp] updateMessageStatus failed:', err)
            )
          } else if (mapped) {
            updateMessageStatus(wamid, mapped).catch((err) =>
              console.warn('[webhooks/whatsapp] updateMessageStatus failed:', err)
            )
          }
        }

        // Handle incoming messages
        if (!value.messages) continue
        for (const msg of value.messages) {
          const from = String(msg.from ?? '')
          if (!from) continue

          let messageType: 'text' | 'image' | 'video' | 'document' = 'text'
          let bodyText = ''
          let attachmentUrl: string | null = null
          let attachmentMimeType: string | null = null
          let attachmentFileName: string | null = null

          if (msg.type === 'text') {
            bodyText = msg.text?.body ?? ''
          } else if (msg.type === 'image') {
            messageType = 'image'
            bodyText = msg.image?.caption ?? '[Image]'
            attachmentUrl = msg.image?.id ? `meta-media://${msg.image.id}` : null
            attachmentMimeType = msg.image?.mime_type ?? null
          } else if (msg.type === 'video') {
            messageType = 'video'
            bodyText = msg.video?.caption ?? '[Video]'
            attachmentUrl = msg.video?.id ? `meta-media://${msg.video.id}` : null
            attachmentMimeType = msg.video?.mime_type ?? null
          } else if (msg.type === 'document') {
            messageType = 'document'
            bodyText = msg.document?.caption ?? `[Document] ${msg.document?.filename ?? ''}`.trim()
            attachmentUrl = msg.document?.id ? `meta-media://${msg.document.id}` : null
            attachmentMimeType = msg.document?.mime_type ?? null
            attachmentFileName = msg.document?.filename ?? null
          } else {
            continue
          }

          if (!bodyText.trim()) bodyText = `[${messageType}]`

          let leadId: string | null = null
          try {
            const supabase = createServiceClient()
            const normalized = normalizePhone(from)
            const last10 = normalized.slice(-10)
            const { data } = await supabase
              .from('leads')
              .select('id')
              .in('phone', [normalized, from, last10])
              .limit(1)
            const rows = data as { id: string }[] | null
            if (rows?.[0]?.id) leadId = rows[0].id
          } catch {
            // ignore
          }

          await saveIncomingMessage({
            phone: from,
            body: bodyText,
            metaMessageId: msg.id,
            leadId,
            messageType,
            attachmentUrl,
            attachmentMimeType,
            attachmentFileName,
          })
          markMessageAsRead(msg.id, config).catch((err) => console.warn('[webhooks/whatsapp] mark read failed:', err))
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[webhooks/whatsapp]', e)
    return NextResponse.json({ ok: true })
  }
}
