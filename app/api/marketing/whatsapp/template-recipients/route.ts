import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

function parseTemplateName(body: string | null): string | null {
  if (!body || typeof body !== 'string') return null
  const m = body.match(/^\[Template:\s*(.+?)\]\s*$/i)
  return m ? m[1].trim() || null : null
}

function digitsKey(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : d
}

export interface TemplateRecipient {
  phone: string
  lead_id: string | null
  lead_name: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  sent_at: string
  replied: boolean
}

export interface TemplateRecipientsResponse {
  templateName: string
  recipients: TemplateRecipient[]
  summary: {
    total: number
    sent: number
    delivered: number
    read: number
    failed: number
    notSent: number
    replied: number
  }
}

const STATUS_RANK: Record<string, number> = { read: 5, delivered: 4, sent: 3, pending: 2, failed: 1 }

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const sp = request.nextUrl.searchParams
    const templateName = sp.get('templateName')
    const startDate = sp.get('startDate')
    const endDate = sp.get('endDate')

    if (!templateName) {
      return NextResponse.json({ error: 'templateName is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const empty: TemplateRecipientsResponse = {
      templateName,
      recipients: [],
      summary: { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, notSent: 0, replied: 0 },
    }

    let query = supabase
      .from('whatsapp_messages')
      .select('phone, lead_id, status, created_at, body')
      .eq('direction', 'out')
      .order('created_at', { ascending: false })
      .limit(5000)

    if (startDate) query = query.gte('created_at', startDate)
    if (endDate) query = query.lte('created_at', endDate)

    const { data: msgs, error } = await query

    if (error) {
      if (error.code === '42P01') return NextResponse.json(empty)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    type MsgRow = { phone: string; lead_id: string | null; status: string | null; created_at: string; body: string | null }

    const templateMsgs = ((msgs ?? []) as MsgRow[]).filter(
      (m) => parseTemplateName(m.body) === templateName
    )

    if (templateMsgs.length === 0) return NextResponse.json(empty)

    // Dedupe by lead/phone — keep the most advanced delivery status
    const byKey = new Map<string, { phone: string; lead_id: string | null; status: string; sent_at: string }>()
    for (const m of templateMsgs) {
      const k = m.lead_id ? `lead:${m.lead_id}` : `phone:${digitsKey(m.phone)}`
      const status = m.status?.toLowerCase() || 'pending'
      const existing = byKey.get(k)
      if (!existing || (STATUS_RANK[status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) {
        byKey.set(k, { phone: m.phone, lead_id: m.lead_id, status, sent_at: m.created_at })
      }
    }

    // Resolve lead names
    const leadIds = [...new Set([...byKey.values()].map((v) => v.lead_id).filter(Boolean))] as string[]
    const leadNames: Record<string, string> = {}
    if (leadIds.length > 0) {
      const { data: lr } = await supabase.from('leads').select('id, name').in('id', leadIds)
      for (const r of (lr ?? []) as Array<{ id: string; name: string | null }>) {
        leadNames[r.id] = r.name ?? '—'
      }
    }

    // Check for inbound replies from these phones in the period
    const recipientDigits = new Set([...byKey.values()].map((v) => digitsKey(v.phone)))
    const repliedDigits = new Set<string>()
    if (recipientDigits.size > 0) {
      const { data: inbound } = await supabase
        .from('whatsapp_messages')
        .select('phone')
        .eq('direction', 'in')
        .gte('created_at', startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .lte('created_at', endDate ?? new Date().toISOString())
        .limit(8000)

      for (const m of (inbound ?? []) as Array<{ phone: string }>) {
        const k = digitsKey(m.phone)
        if (recipientDigits.has(k)) repliedDigits.add(k)
      }
    }

    const recipients: TemplateRecipient[] = [...byKey.values()].map(({ phone, lead_id, status, sent_at }) => ({
      phone,
      lead_id,
      lead_name: lead_id ? (leadNames[lead_id] ?? null) : null,
      status: status as TemplateRecipient['status'],
      sent_at,
      replied: repliedDigits.has(digitsKey(phone)),
    }))

    // Sort: read first, then by status rank, then by sent_at desc
    recipients.sort(
      (a, b) =>
        (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) ||
        b.sent_at.localeCompare(a.sent_at)
    )

    const summary = {
      total: recipients.length,
      sent: recipients.filter((r) => r.status === 'sent').length,
      delivered: recipients.filter((r) => r.status === 'delivered').length,
      read: recipients.filter((r) => r.status === 'read').length,
      failed: recipients.filter((r) => r.status === 'failed').length,
      notSent: recipients.filter((r) => r.status === 'pending' || r.status === 'failed').length,
      replied: recipients.filter((r) => r.replied).length,
    }

    return NextResponse.json({ templateName, recipients, summary } satisfies TemplateRecipientsResponse)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load template recipients' },
      { status: 500 }
    )
  }
}
