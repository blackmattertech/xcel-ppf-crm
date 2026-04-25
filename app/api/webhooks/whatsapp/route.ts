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
function readContext(msg: unknown): Record<string, unknown> | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>
  const top = m.context
  if (top && typeof top === 'object') return top as Record<string, unknown>
  const inner = m.message
  if (inner && typeof inner === 'object') {
    const c = (inner as Record<string, unknown>).context
    if (c && typeof c === 'object') return c as Record<string, unknown>
  }
  // Some payload variants carry `context` inside the type-specific object (text/image/video/document/interactive/etc).
  for (const v of Object.values(m)) {
    if (!v || typeof v !== 'object') continue
    const c = (v as Record<string, unknown>).context
    if (c && typeof c === 'object') return c as Record<string, unknown>
  }
  return null
}

function collectObjects(root: unknown, maxDepth = 4): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const seen = new Set<unknown>()
  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object') return
    if (seen.has(value) || depth > maxDepth) return
    seen.add(value)
    const obj = value as Record<string, unknown>
    out.push(obj)
    for (const child of Object.values(obj)) {
      if (Array.isArray(child)) {
        for (const item of child) walk(item, depth + 1)
      } else {
        walk(child, depth + 1)
      }
    }
  }
  walk(root, 0)
  return out
}

function collectStrings(root: unknown, maxDepth = 5): string[] {
  const out: string[] = []
  const seen = new Set<unknown>()
  const walk = (value: unknown, depth: number) => {
    if (depth > maxDepth || value == null) return
    if (typeof value === 'string') {
      const s = value.trim()
      if (s) out.push(s)
      return
    }
    if (typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1)
      return
    }
    for (const v of Object.values(value as Record<string, unknown>)) walk(v, depth + 1)
  }
  walk(root, 0)
  return out
}

/** Meta `context.id` (wamid of the quoted message). */
function extractReplyToMetaId(msg: unknown): string | null {
  const selfWamid =
    msg && typeof msg === 'object' && typeof (msg as Record<string, unknown>).id === 'string'
      ? String((msg as Record<string, unknown>).id).trim()
      : ''
  const ctx = readContext(msg)
  if (ctx) {
    const id = ctx.id
    if (typeof id === 'string' && id.trim()) return id.trim()
    const messageId = (ctx as Record<string, unknown>).message_id
    if (typeof messageId === 'string' && messageId.trim()) return messageId.trim()
  }

  // Fallback for payload variants where reply reference is nested differently.
  for (const obj of collectObjects(msg)) {
    const keys: Array<keyof typeof obj> = ['message_id', 'quoted_message_id', 'reply_to', 'context_message_id', 'id']
    for (const k of keys) {
      const v = obj[k]
      if (typeof v !== 'string') continue
      const trimmed = v.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('wamid.')) return trimmed
    }
  }

  // Last-resort: find any wamid in the payload that is not this message's own id.
  const wamids = collectStrings(msg).filter((s) => s.startsWith('wamid.'))
  for (const candidate of wamids) {
    if (selfWamid && candidate === selfWamid) continue
    return candidate
  }
  return null
}

/** Meta `context.from` — who sent the quoted message (digits). Used for CRM quote labels. */
function extractReplyContextFrom(msg: unknown): string | null {
  // IMPORTANT: Only treat `context.from` as reply metadata when Meta actually sent a reply context.
  // Older fallback heuristics were too permissive and caused normal inbound messages to render as replies in the inbox UI.
  const ctx = readContext(msg)
  if (!ctx) return null
  const hasContextId =
    (typeof ctx.id === 'string' && ctx.id.trim()) ||
    (typeof (ctx as Record<string, unknown>).message_id === 'string' && String((ctx as Record<string, unknown>).message_id).trim())
  if (!hasContextId) return null
  const from = ctx.from
  if (typeof from === 'string' && from.trim()) return from.trim()
  return null
}

function mapWebhookStatusToMessageStatus(raw: string): StatusValue | null {
  const s = String(raw ?? '').toLowerCase().trim()
  if (s === 'failed') return 'failed'
  if (s === 'played') return 'read'
  if (s === 'sent' || s === 'delivered' || s === 'read') return s
  return null
}

type ParsedIncoming = {
  messageType: 'text' | 'image' | 'video' | 'document'
  bodyText: string
  attachmentUrl: string | null
  attachmentMimeType: string | null
  attachmentFileName: string | null
}

/**
 * Map Cloud API webhook message to DB row fields.
 * Previously only text/image/video/document were handled; everything else hit `continue` and never appeared in the inbox.
 */
function parseIncomingMessagePayload(msg: {
  type: string
  text?: { body?: string }
  image?: { id?: string; mime_type?: string; caption?: string }
  video?: { id?: string; mime_type?: string; caption?: string }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string; description?: string }
  }
  button?: { text?: string; payload?: string }
  audio?: { id?: string; mime_type?: string }
  voice?: { id?: string; mime_type?: string }
  sticker?: { id?: string; mime_type?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
}): ParsedIncoming | null {
  const t = String(msg.type ?? '').toLowerCase()
  let messageType: ParsedIncoming['messageType'] = 'text'
  let bodyText = ''
  let attachmentUrl: string | null = null
  let attachmentMimeType: string | null = null
  let attachmentFileName: string | null = null

  if (t === 'text') {
    bodyText = msg.text?.body ?? ''
  } else if (t === 'image') {
    messageType = 'image'
    bodyText = msg.image?.caption ?? '[Image]'
    attachmentUrl = msg.image?.id ? `meta-media://${msg.image.id}` : null
    attachmentMimeType = msg.image?.mime_type ?? null
  } else if (t === 'video') {
    messageType = 'video'
    bodyText = msg.video?.caption ?? '[Video]'
    attachmentUrl = msg.video?.id ? `meta-media://${msg.video.id}` : null
    attachmentMimeType = msg.video?.mime_type ?? null
  } else if (t === 'document') {
    messageType = 'document'
    bodyText = msg.document?.caption ?? `[Document] ${msg.document?.filename ?? ''}`.trim()
    attachmentUrl = msg.document?.id ? `meta-media://${msg.document.id}` : null
    attachmentMimeType = msg.document?.mime_type ?? null
    attachmentFileName = msg.document?.filename ?? null
  } else if (t === 'interactive') {
    const inter = msg.interactive
    const interType = String(inter?.type ?? '').toLowerCase()
    if (interType === 'button_reply') {
      const br = inter?.button_reply
      bodyText = (br?.title ?? br?.id ?? '').trim() || '[Button reply]'
    } else if (interType === 'list_reply') {
      const lr = inter?.list_reply
      const title = (lr?.title ?? '').trim()
      const desc = (lr?.description ?? '').trim()
      bodyText = [title, desc].filter(Boolean).join(' — ') || '[List reply]'
    } else {
      bodyText = interType ? `[Interactive: ${interType}]` : '[Interactive]'
    }
  } else if (t === 'button') {
    const btn = msg.button
    bodyText = (btn?.text ?? btn?.payload ?? '').trim() || '[Button]'
  } else if (t === 'audio' || t === 'voice') {
    const aud = t === 'voice' ? msg.voice : msg.audio
    const id = aud?.id
    bodyText = t === 'voice' ? '[Voice message]' : '[Audio]'
    if (id) {
      attachmentUrl = `meta-media://${id}`
      attachmentMimeType = aud?.mime_type ?? (t === 'voice' ? 'audio/ogg' : 'audio/mpeg')
    }
  } else if (t === 'sticker') {
    messageType = 'image'
    bodyText = '[Sticker]'
    attachmentUrl = msg.sticker?.id ? `meta-media://${msg.sticker.id}` : null
    attachmentMimeType = msg.sticker?.mime_type ?? 'image/webp'
  } else if (t === 'location') {
    const loc = msg.location
    if (loc) {
      const parts = [loc.name, loc.address].filter(Boolean)
      bodyText =
        parts.length > 0
          ? parts.join(' — ')
          : typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
            ? `📍 ${loc.latitude}, ${loc.longitude}`
            : '[Location]'
    } else {
      bodyText = '[Location]'
    }
  } else if (t === 'contacts') {
    bodyText = '[Contact card]'
  } else if (t === 'reaction') {
    // Emoji reaction to another message — not a thread bubble; skip insert.
    return null
  } else if (t === 'system' || t === 'order' || t === 'unknown') {
    bodyText = `[${t}]`
  } else {
    bodyText = t ? `[${t}]` : '[Message]'
  }

  if (!bodyText.trim()) bodyText = `[${messageType}]`
  return { messageType, bodyText, attachmentUrl, attachmentMimeType, attachmentFileName }
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
              context?: { from?: string; id?: string }
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
    if (process.env.WHATSAPP_WEBHOOK_DEBUG === 'true') {
      const sample = body.entry?.slice(0, 3).map((e) => ({
        idType: typeof e.id,
        changeFields: e.changes?.map((c) => ({
          field: c.field,
          hasMessages: Array.isArray(c.value?.messages) ? c.value!.messages!.length : 0,
          hasStatuses: Array.isArray(c.value?.statuses) ? c.value!.statuses!.length : 0,
          hasTemplateEvent: !!(c.value && 'event' in c.value && c.value.event),
        })),
      }))
      console.info('[webhooks/whatsapp] WHATSAPP_WEBHOOK_DEBUG payload shape', {
        object: body.object,
        entryLen: body.entry?.length ?? 0,
        sample,
      })
    }

    if (body.object !== 'whatsapp_business_account' || !body.entry?.length) {
      if (body.entry?.length && body.object) {
        console.warn(
          '[webhooks/whatsapp] Ignoring webhook: object is not whatsapp_business_account (no messages will be stored). object=',
          body.object,
          '— Fix Meta app / subscription so WhatsApp Cloud API hits this URL, or you subscribed the wrong product.'
        )
      }
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
            const errs = (st as { errors?: Array<{ code: number; title: string; message?: string; error_data?: unknown }> }).errors ?? []
            console.error('[webhooks/whatsapp] Message delivery FAILED:', JSON.stringify({
              messageId: wamid,
              recipientId: st.recipient_id,
              errors: errs,
              hint: '131047=user not opted in / 24h window closed | 131026=template rejected | 131031=recipient blocked | 131053=media upload error (bad URL, wrong MIME type, file too large, or unsupported format)',
            }, null, 2))
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
        if (!value.messages?.length) continue

        console.info('[webhooks/whatsapp] inbound messages', {
          field: change.field ?? '(missing)',
          count: value.messages.length,
          wabaIdSuffix: wabaId.length > 6 ? wabaId.slice(-6) : wabaId,
        })

        for (const msg of value.messages) {
          const from = String(msg.from ?? '')
          if (!from) continue

          const parsed = parseIncomingMessagePayload(msg)
          if (!parsed) continue

          const { messageType, bodyText, attachmentUrl, attachmentMimeType, attachmentFileName } = parsed

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
          } catch (err) {
            console.warn(
              '[webhooks/whatsapp] lead lookup failed (message will still be saved without lead_id):',
              err instanceof Error ? err.message : err
            )
          }

          const metaId = typeof msg.id === 'string' ? msg.id.trim() : String(msg.id ?? '').trim()
          const replyTo = extractReplyToMetaId(msg)
          const replyFrom = replyTo ? extractReplyContextFrom(msg) : null
          let saved
          try {
            saved = await saveIncomingMessage({
              phone: from,
              body: bodyText,
              metaMessageId: metaId || null,
              leadId,
              messageType,
              attachmentUrl,
              attachmentMimeType,
              attachmentFileName,
              replyToMetaMessageId: replyTo,
              replyContextFrom: replyFrom,
            })
          } catch (err) {
            console.error('[webhooks/whatsapp] saveIncomingMessage threw:', err)
            return NextResponse.json({ ok: false, error: 'persist_inbound_failed' }, { status: 500 })
          }

          if (!saved) {
            console.error(
              '[webhooks/whatsapp] saveIncomingMessage returned null — check server logs for [whatsapp-chat] saveIncomingMessage, ' +
                'SUPABASE_SERVICE_ROLE_KEY on the host, and that migrations for whatsapp_messages are applied.'
            )
            return NextResponse.json({ ok: false, error: 'persist_inbound_failed' }, { status: 500 })
          }

          markMessageAsRead(metaId, config).catch((err) => console.warn('[webhooks/whatsapp] mark read failed:', err))
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[webhooks/whatsapp] unhandled:', e)
    if (errMsg.includes('Service role key is not configured')) {
      console.error(
        '[webhooks/whatsapp] Fix: set SUPABASE_SERVICE_ROLE_KEY in production (e.g. Vercel → Environment Variables). ' +
          'Without it, inbound messages cannot be written to Supabase.'
      )
    }
    // Non-2xx so Meta shows failed delivery and retries; returning 200 hid DB/config errors from you.
    return NextResponse.json({ ok: false, error: 'webhook_handler_error' }, { status: 500 })
  }
}
