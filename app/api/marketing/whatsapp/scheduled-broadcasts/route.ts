import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import type { ResolvedBroadcastPayload } from '@/backend/services/whatsapp-broadcast-resolve'

export interface ScheduledBroadcastListItem {
  id: string
  scheduledAt: string
  status: string
  createdAt: string
  templateName: string
  templateLanguage: string
  recipientCount: number
  /** From last `result_json.sent` when job finished (Meta successes recorded on job). */
  lastJobSentCount: number | null
  delayMs: number
  errorMessage: string | null
}

type ScheduledBroadcastListRow = {
  id: string
  scheduled_at: string
  status: string
  created_at: string
  payload_json: unknown
  result_json: unknown
  error_message: string | null
}

function mapRow(row: ScheduledBroadcastListRow): ScheduledBroadcastListItem {
  const payload = row.payload_json as ResolvedBroadcastPayload | null
  const recipients = Array.isArray(payload?.recipients) ? payload.recipients : []
  const rj = row.result_json as { sent?: number } | null
  const lastJobSentCount = typeof rj?.sent === 'number' ? rj.sent : null
  return {
    id: row.id,
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdAt: row.created_at,
    templateName: payload?.templateName ?? '—',
    templateLanguage: payload?.templateLanguage ?? '—',
    recipientCount: recipients.length,
    lastJobSentCount,
    delayMs: payload?.delayMs ?? 250,
    errorMessage: row.error_message,
  }
}

/** List scheduled broadcasts created by the current user */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    if (!user?.id) {
      return NextResponse.json({ error: 'User id missing' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const limit = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 100))

    const { data: rows, error } = await supabase
      .from('scheduled_broadcasts')
      .select('id, scheduled_at, status, created_at, payload_json, result_json, error_message')
      .eq('created_by', user.id)
      .order('scheduled_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ items: [], message: 'scheduled_broadcasts table not found' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const items = (rows ?? []).map((r) => mapRow(r as ScheduledBroadcastListRow))

    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list scheduled broadcasts' },
      { status: 500 }
    )
  }
}
