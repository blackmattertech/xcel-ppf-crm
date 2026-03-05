import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

/** Parse template name from body when saved as "[Template: name]" from send-template. */
function parseTemplateName(body: string | null): string | null {
  if (!body || typeof body !== 'string') return null
  const m = body.match(/^\[Template:\s*(.+?)\]\s*$/i)
  return m ? m[1].trim() || null : null
}

export interface WhatsAppAnalyticsResponse {
  messagesByDirection: Record<string, number>
  messagesByStatus: Record<string, number>
  messagesOverTime: Array<{ date: string; sent: number; received: number; total: number }>
  messagesByTemplate: Array<{ template: string; count: number }>
  totals: { sent: number; received: number; total: number }
  period: { startDate: string; endDate: string }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') ?? new Date().toISOString()

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
      totals,
      period: { startDate, endDate },
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch WhatsApp analytics' },
      { status: 500 }
    )
  }
}
