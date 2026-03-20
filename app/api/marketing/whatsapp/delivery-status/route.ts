import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

/** Normalize status for grouping: null -> pending, else as-is */
function norm(s: string | null): string {
  if (s === null || s === undefined || s === '') return 'pending'
  return String(s).toLowerCase()
}

export interface DeliveryStatusItem {
  phone: string
  lead_id: string | null
  lead_name: string | null
}

export interface DeliveryStatusByStatus {
  count: number
  items: DeliveryStatusItem[]
}

export interface DeliveryStatusResponse {
  byStatus: Record<string, DeliveryStatusByStatus>
  summary: {
    pending: number
    sent: number
    delivered: number
    read: number
    failed: number
    notDelivered: number
    notRead: number
  }
  period?: { startDate: string; endDate: string }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') ?? undefined
    const endDate = searchParams.get('endDate') ?? undefined

    let query = supabase
      .from('whatsapp_messages')
      .select('id, phone, lead_id, status, created_at')
      .eq('direction', 'out')

    if (startDate) query = query.gte('created_at', startDate)
    if (endDate) query = query.lte('created_at', endDate)

    const { data: rows, error } = await query

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          byStatus: {},
          summary: { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, notDelivered: 0, notRead: 0 },
        } satisfies DeliveryStatusResponse)
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const messages = (rows ?? []) as Array<{ id: string; phone: string; lead_id: string | null; status: string | null; created_at: string }>

    // Group by status; for each status keep distinct (phone, lead_id) with latest row
    const byStatusKey: Record<string, Map<string, { phone: string; lead_id: string | null }>> = {
      pending: new Map(),
      sent: new Map(),
      delivered: new Map(),
      read: new Map(),
      failed: new Map(),
    }

    for (const m of messages) {
      const key = norm(m.status)
      if (!byStatusKey[key]) byStatusKey[key] = new Map()
      const dedupeKey = m.lead_id ? `lead:${m.lead_id}` : `phone:${m.phone}`
      byStatusKey[key].set(dedupeKey, { phone: m.phone, lead_id: m.lead_id })
    }

    const leadIds = new Set<string>()
    for (const map of Object.values(byStatusKey)) {
      for (const v of map.values()) {
        if (v.lead_id) leadIds.add(v.lead_id)
      }
    }

    let leadNames: Record<string, string> = {}
    if (leadIds.size > 0) {
      const { data: leadRows } = await supabase
        .from('leads')
        .select('id, name')
        .in('id', Array.from(leadIds))
      for (const r of (leadRows ?? []) as Array<{ id: string; name: string | null }>) {
        leadNames[r.id] = r.name ?? '—'
      }
    }

    const byStatus: Record<string, DeliveryStatusByStatus> = {}
    for (const [statusKey, map] of Object.entries(byStatusKey)) {
      const items: DeliveryStatusItem[] = Array.from(map.values()).map(({ phone, lead_id }) => ({
        phone,
        lead_id,
        lead_name: lead_id ? leadNames[lead_id] ?? null : null,
      }))
      byStatus[statusKey] = { count: items.length, items }
    }

    const summary = {
      pending: byStatus.pending?.count ?? 0,
      sent: byStatus.sent?.count ?? 0,
      delivered: byStatus.delivered?.count ?? 0,
      read: byStatus.read?.count ?? 0,
      failed: byStatus.failed?.count ?? 0,
      notDelivered: (byStatus.pending?.count ?? 0) + (byStatus.sent?.count ?? 0),
      notRead: (byStatus.pending?.count ?? 0) + (byStatus.sent?.count ?? 0) + (byStatus.delivered?.count ?? 0),
    }

    const response: DeliveryStatusResponse = {
      byStatus,
      summary,
      ...(startDate && endDate ? { period: { startDate, endDate } } : {}),
    }
    return NextResponse.json(response)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch delivery status' },
      { status: 500 }
    )
  }
}
