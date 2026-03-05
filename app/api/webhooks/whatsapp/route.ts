import { NextRequest, NextResponse } from 'next/server'
import { saveIncomingMessage, updateMessageStatus } from '@/backend/services/whatsapp-chat.service'
import { markMessageAsRead } from '@/backend/services/whatsapp.service'
import { getWhatsAppConfigByWabaId } from '@/backend/services/whatsapp-config.service'
import { getWhatsAppConfig } from '@/backend/services/whatsapp.service'
import { createServiceClient } from '@/lib/supabase/service'

/** Meta WhatsApp webhook: GET for verification, POST for incoming messages and status updates. */

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length > 10 ? d : '91' + d.slice(-10)
}

type StatusValue = 'sent' | 'delivered' | 'read'

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
          value?: {
            messages?: Array<{ from: string; id: string; timestamp: string; type: string; text?: { body: string } }>
            statuses?: Array<{ id: string; status: string; recipient_id?: string; timestamp: string }>
          }
        }>
      }>
    }
    if (body.object !== 'whatsapp_business_account' || !body.entry?.length) {
      return NextResponse.json({ ok: true })
    }

    for (const entry of body.entry) {
      const wabaId = entry.id
      const waConfig = wabaId ? await getWhatsAppConfigByWabaId(wabaId) : null
      const config = waConfig ?? getWhatsAppConfig()
      const changes = entry.changes ?? []
      for (const change of changes) {
        const value = change.value
        if (!value) continue

        // Handle status updates (sent, delivered, read)
        const statuses = value.statuses ?? []
        for (const st of statuses) {
          const status = String(st.status ?? '').toLowerCase()
          if (['sent', 'delivered', 'read'].includes(status)) {
            updateMessageStatus(st.id, status as StatusValue).catch((err) =>
              console.warn('[webhooks/whatsapp] updateMessageStatus failed:', err)
            )
          }
        }

        // Handle incoming messages
        if (!value.messages) continue
        for (const msg of value.messages) {
          const from = String(msg.from ?? '')
          const textBody = msg.type === 'text' ? msg.text?.body : null
          if (!from || textBody == null) continue

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
            body: textBody,
            metaMessageId: msg.id,
            leadId,
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
