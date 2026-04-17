import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import type { ResolvedBroadcastPayload } from '@/backend/services/whatsapp-broadcast-resolve'

type ResultRow = { phone: string; success?: boolean; error?: string; messageId?: string }

function digitsKey(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length >= 10) return d.slice(-10)
  return d
}

function campaignAnchor(row: {
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
}): string {
  return row.completed_at ?? row.started_at ?? row.scheduled_at
}

function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end
}

export type CampaignRecipient = { phone: string; name: string | null }

export type CampaignFailedItem = { phone: string; name: string | null; error: string }

export type CampaignRepliedItem = {
  phone: string
  name: string | null
  firstReplyAt: string
  preview: string
}

export type CampaignSummary = {
  id: string
  templateName: string
  templateLanguage: string
  scheduledAt: string
  startedAt: string | null
  completedAt: string | null
  status: string
  recipientCount: number
  sent: number
  failed: number
  repliedCount: number
  errorMessage: string | null
}

export type CampaignDetail = CampaignSummary & {
  failedRecipients: CampaignFailedItem[]
  repliedRecipients: CampaignRepliedItem[]
}

type BroadcastRow = {
  id: string
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  status: string
  payload_json: unknown
  result_json: unknown
  error_message: string | null
}

function parseSummary(row: BroadcastRow): Omit<CampaignSummary, 'repliedCount'> {
  const payload = row.payload_json as ResolvedBroadcastPayload | null
  const recipients = Array.isArray(payload?.recipients) ? payload.recipients : []
  const result = row.result_json as { sent?: number; failed?: number; results?: ResultRow[] } | null
  const sent = typeof result?.sent === 'number' ? result.sent : 0
  const failed = typeof result?.failed === 'number' ? result.failed : 0
  return {
    id: row.id,
    templateName: payload?.templateName ?? '—',
    templateLanguage: payload?.templateLanguage ?? '—',
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    recipientCount: recipients.length,
    sent,
    failed,
    errorMessage: row.error_message,
  }
}

function recipientPhoneNameMap(payload: ResolvedBroadcastPayload | null): Map<string, CampaignRecipient> {
  const map = new Map<string, CampaignRecipient>()
  const list = Array.isArray(payload?.recipients) ? payload.recipients : []
  for (const raw of list) {
    const r = raw as { phone?: string; name?: string }
    const phone = typeof r?.phone === 'string' ? r.phone : ''
    if (!phone) continue
    map.set(digitsKey(phone), {
      phone,
      name: typeof r?.name === 'string' ? r.name : null,
    })
  }
  return map
}

/** GET ?startDate=&endDate= — list campaigns in range. GET ?campaignId= — full detail for one (must be yours). */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult
    if (!user?.id) return NextResponse.json({ error: 'User id missing' }, { status: 400 })

    const sp = request.nextUrl.searchParams
    const campaignId = sp.get('campaignId')
    const startDate = sp.get('startDate')
    const endDate = sp.get('endDate')

    const supabase = createServiceClient()

    if (campaignId) {
      const { data: row, error } = await supabase
        .from('scheduled_broadcasts')
        .select(
          'id, scheduled_at, started_at, completed_at, status, payload_json, result_json, error_message, created_by'
        )
        .eq('id', campaignId)
        .maybeSingle()

      if (error) {
        if (error.code === '42P01') {
          return NextResponse.json({ error: 'scheduled_broadcasts table not found' }, { status: 503 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!row || (row as { created_by: string | null }).created_by !== user.id) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
      }

      const b = row as BroadcastRow
      const payload = b.payload_json as ResolvedBroadcastPayload | null
      const phoneBook = recipientPhoneNameMap(payload)
      const result = b.result_json as { results?: ResultRow[] } | null
      const results = Array.isArray(result?.results) ? result.results : []

      const failed: CampaignFailedItem[] = []
      for (const r of results) {
        if (r.success !== false) continue
        const k = digitsKey(r.phone)
        const rec = phoneBook.get(k)
        failed.push({
          phone: r.phone,
          name: rec?.name ?? null,
          error: typeof r.error === 'string' && r.error.trim() ? r.error : 'Failed',
        })
      }

      const summary = parseSummary(b)
      const campaignStart = b.started_at ?? b.scheduled_at
      const trackEnd = endDate ?? new Date().toISOString()

      let replied: CampaignRepliedItem[] = []
      if (phoneBook.size > 0 && campaignStart <= trackEnd) {
        const { data: inbound } = await supabase
          .from('whatsapp_messages')
          .select('phone, created_at, body')
          .eq('direction', 'in')
          .gte('created_at', campaignStart)
          .lte('created_at', trackEnd)
          .order('created_at', { ascending: true })
          .limit(5000)

        const byPhoneFirst = new Map<string, { at: string; preview: string }>()
        for (const m of (inbound ?? []) as Array<{ phone: string; created_at: string; body: string }>) {
          const k = digitsKey(m.phone)
          if (!phoneBook.has(k)) continue
          if (!byPhoneFirst.has(k)) {
            const preview = (m.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
            byPhoneFirst.set(k, { at: m.created_at, preview: preview || '(no text)' })
          }
        }
        replied = [...byPhoneFirst.entries()].map(([k, v]) => {
          const rec = phoneBook.get(k)!
          return {
            phone: rec.phone,
            name: rec.name,
            firstReplyAt: v.at,
            preview: v.preview,
          }
        })
        replied.sort((a, b) => a.firstReplyAt.localeCompare(b.firstReplyAt))
      }

      const detail: CampaignDetail = {
        ...summary,
        repliedCount: replied.length,
        failedRecipients: failed,
        repliedRecipients: replied,
      }
      return NextResponse.json({ campaign: detail })
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required (ISO 8601)' }, { status: 400 })
    }

    const { data: rows, error: listError } = await supabase
      .from('scheduled_broadcasts')
      .select('id, scheduled_at, started_at, completed_at, status, payload_json, result_json, error_message')
      .eq('created_by', user.id)
      .order('scheduled_at', { ascending: false })
      .limit(400)

    if (listError) {
      if (listError.code === '42P01') {
        return NextResponse.json({ campaigns: [], message: 'scheduled_broadcasts table not found' })
      }
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const list = (rows ?? []) as BroadcastRow[]
    const inWindow = list.filter((r) => inRange(campaignAnchor(r), startDate, endDate))

    const minStart =
      inWindow.length === 0
        ? startDate
        : inWindow.reduce((acc, r) => {
            const s = r.started_at ?? r.scheduled_at
            return s < acc ? s : acc
          }, inWindow[0].started_at ?? inWindow[0].scheduled_at)

    const { data: inboundAll } =
      inWindow.length > 0
        ? await supabase
            .from('whatsapp_messages')
            .select('phone, created_at, body')
            .eq('direction', 'in')
            .gte('created_at', minStart)
            .lte('created_at', endDate)
            .order('created_at', { ascending: true })
            .limit(8000)
        : { data: [] as Array<{ phone: string; created_at: string; body: string }> }

    const inboundList = (inboundAll ?? []) as Array<{ phone: string; created_at: string; body: string }>

    const campaigns: CampaignSummary[] = inWindow.map((row) => {
      const summary = parseSummary(row)
      const payload = row.payload_json as ResolvedBroadcastPayload | null
      const phoneBook = recipientPhoneNameMap(payload)
      const campaignStart = row.started_at ?? row.scheduled_at

      const firstReplyKey = new Set<string>()
      for (const m of inboundList) {
        const k = digitsKey(m.phone)
        if (!phoneBook.has(k)) continue
        if (m.created_at >= campaignStart && m.created_at <= endDate) {
          firstReplyKey.add(k)
        }
      }

      return {
        ...summary,
        repliedCount: firstReplyKey.size,
      }
    })

    return NextResponse.json({ campaigns, period: { startDate, endDate } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load campaign analytics' },
      { status: 500 }
    )
  }
}
