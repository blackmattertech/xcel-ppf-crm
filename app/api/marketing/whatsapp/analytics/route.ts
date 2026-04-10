import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getCache, setCache, CACHE_TTL } from '@/lib/cache'

/** Parse template name from body when saved as "[Template: name]" from send-template. */
function parseTemplateName(body: string | null): string | null {
  if (!body || typeof body !== 'string') return null
  const m = body.match(/^\[Template:\s*(.+?)\]\s*$/i)
  return m ? m[1].trim() || null : null
}

export interface TemplateDeliveryStatRow {
  template: string
  pending: number
  sent: number
  delivered: number
  read: number
  failed: number
  other: number
  total: number
}

export interface WhatsAppAnalyticsResponse {
  messagesByDirection: Record<string, number>
  messagesByStatus: Record<string, number>
  messagesOverTime: Array<{ date: string; sent: number; received: number; total: number }>
  messagesByTemplate: Array<{ template: string; count: number }>
  /** Outgoing template-tagged rows only: counts per Meta-style status per template */
  templateDeliveryStats: TemplateDeliveryStatRow[]
  totals: { sent: number; received: number; total: number }
  period: { startDate: string; endDate: string }
}

const KNOWN_OUT_STATUSES = new Set(['pending', 'sent', 'delivered', 'read', 'failed'])

function emptyStatusBuckets(): Record<'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'other', number> {
  return { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, other: 0 }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') ?? new Date().toISOString()

    // Cache key scoped to date range so different ranges don't collide
    const cacheKey = `wa:analytics:${startDate.slice(0, 10)}:${endDate.slice(0, 10)}`
    const cached = await getCache<WhatsAppAnalyticsResponse>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const { data: rows, error } = await supabase
      .from('whatsapp_messages')
      .select('direction, status, body, created_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          messagesByDirection: { in: 0, out: 0 },
          messagesByStatus: {},
          messagesOverTime: [],
          messagesByTemplate: [],
          templateDeliveryStats: [],
          totals: { sent: 0, received: 0, total: 0 },
          period: { startDate, endDate },
        } satisfies WhatsAppAnalyticsResponse)
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const messages = (rows ?? []) as Array<{ direction: string; status: string | null; body: string; created_at: string }>

    const messagesByDirection: Record<string, number> = { in: 0, out: 0 }
    const messagesByStatus: Record<string, number> = {}
    const templateCounts: Record<string, number> = {}
    const templateByStatus: Record<string, ReturnType<typeof emptyStatusBuckets>> = {}
    const start = new Date(startDate)
    const end = new Date(endDate)
    const dayMap: Record<string, { sent: number; received: number }> = {}
    for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      dayMap[key] = { sent: 0, received: 0 }
    }

    for (const m of messages) {
      const dir = m.direction === 'out' ? 'out' : 'in'
      messagesByDirection[dir] = (messagesByDirection[dir] ?? 0) + 1

      if (m.direction === 'out') {
        const status = m.status && m.status.trim() ? m.status.trim().toLowerCase() : 'pending'
        messagesByStatus[status] = (messagesByStatus[status] ?? 0) + 1
        const template = parseTemplateName(m.body)
        if (template) {
          templateCounts[template] = (templateCounts[template] ?? 0) + 1
          if (!templateByStatus[template]) {
            templateByStatus[template] = { ...emptyStatusBuckets() }
          }
          const bucket: keyof ReturnType<typeof emptyStatusBuckets> = KNOWN_OUT_STATUSES.has(status)
            ? (status as keyof ReturnType<typeof emptyStatusBuckets>)
            : 'other'
          templateByStatus[template][bucket] += 1
        }
      }

      const key = m.created_at.slice(0, 10)
      if (dayMap[key]) {
        if (m.direction === 'out') dayMap[key].sent += 1
        else dayMap[key].received += 1
      }
    }

    const messagesOverTime = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sent, received }]) => ({
        date,
        sent,
        received,
        total: sent + received,
      }))

    const messagesByTemplate = Object.entries(templateCounts)
      .map(([template, count]) => ({ template, count }))
      .sort((a, b) => b.count - a.count)

    const templateDeliveryStats: TemplateDeliveryStatRow[] = Object.entries(templateByStatus)
      .map(([template, b]) => {
        const pending = b.pending ?? 0
        const sent = b.sent ?? 0
        const delivered = b.delivered ?? 0
        const read = b.read ?? 0
        const failed = b.failed ?? 0
        const other = b.other ?? 0
        const total = pending + sent + delivered + read + failed + other
        return { template, pending, sent, delivered, read, failed, other, total }
      })
      .sort((a, b) => b.total - a.total)

    const totals = {
      sent: messagesByDirection.out ?? 0,
      received: messagesByDirection.in ?? 0,
      total: messages.length,
    }

    const result: WhatsAppAnalyticsResponse = {
      messagesByDirection,
      messagesByStatus,
      messagesOverTime,
      messagesByTemplate,
      templateDeliveryStats,
      totals,
      period: { startDate, endDate },
    }

    await setCache(cacheKey, result, CACHE_TTL.LONG)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch WhatsApp analytics' },
      { status: 500 }
    )
  }
}
