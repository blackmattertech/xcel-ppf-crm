import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import type { ResolvedBroadcastPayload } from '@/backend/services/whatsapp-broadcast-resolve'

type RouteContext = { params: Promise<{ id: string }> }

type ResultRow = { phone?: string; success?: boolean; messageId?: string }

function digitsKey(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : d
}

function parseTemplateName(body: string | null): string | null {
  if (!body || typeof body !== 'string') return null
  const m = body.match(/^\s*\[Template:\s*(.+?)\]\s*$/im) ?? body.match(/\[Template:\s*(.+?)\]/i)
  return m ? m[1].trim() || null : null
}

/**
 * Re-queue a **completed** or **failed** scheduled job so `process-scheduled` sends only recipients
 * that never got a successful Meta send (per `result_json.results` + CRM rows in the job window).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult
    if (!user?.id) return NextResponse.json({ error: 'User id missing' }, { status: 400 })

    const { id } = await context.params
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('scheduled_broadcasts')
      .select('id, status, scheduled_at, started_at, completed_at, payload_json, result_json, created_by')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Scheduled broadcast not found' }, { status: 404 })

    const row = data as {
      id: string
      status: string
      scheduled_at: string
      started_at: string | null
      completed_at: string | null
      payload_json: ResolvedBroadcastPayload
      result_json: unknown
      created_by: string | null
    }

    if (row.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (row.status !== 'completed' && row.status !== 'failed') {
      return NextResponse.json(
        {
          error: `Job is "${row.status}". Only completed or failed jobs can be resume-requeued. Pending jobs are processed automatically.`,
        },
        { status: 409 }
      )
    }

    const payload = row.payload_json
    const recipients = Array.isArray(payload.recipients) ? payload.recipients : []
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients on this job' }, { status: 400 })
    }

    const templateName = (payload.templateName ?? '').trim()
    if (!templateName) return NextResponse.json({ error: 'Missing template name on job' }, { status: 400 })

    const resultJson = (row.result_json && typeof row.result_json === 'object' ? row.result_json : {}) as Record<string, unknown>
    const results = (Array.isArray(resultJson.results) ? resultJson.results : []) as ResultRow[]

    const successKeys = new Set<string>()
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const phone = (typeof r?.phone === 'string' ? r.phone : recipients[i]?.phone) ?? ''
      if (r?.success && phone) successKeys.add(digitsKey(phone))
    }

    const windowStart = new Date(new Date(row.scheduled_at).getTime() - 2 * 60 * 60 * 1000).toISOString()
    const windowEnd = row.completed_at
      ? new Date(new Date(row.completed_at).getTime() + 2 * 60 * 60 * 1000).toISOString()
      : new Date().toISOString()

    const { data: crmRows } = await supabase
      .from('whatsapp_messages')
      .select('phone, status, meta_message_id, body, template_name')
      .eq('direction', 'out')
      .not('meta_message_id', 'is', null)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .limit(5000)

    for (const m of (crmRows ?? []) as Array<{
      phone: string
      status: string | null
      body: string | null
      template_name: string | null
    }>) {
      const name = m.template_name ?? parseTemplateName(m.body)
      if (name !== templateName) continue
      const st = (m.status ?? '').toLowerCase()
      if (st === 'failed') continue
      successKeys.add(digitsKey(m.phone))
    }

    const remaining = recipients.filter((r) => !successKeys.has(digitsKey(r.phone)))

    if (remaining.length === 0) {
      return NextResponse.json({
        requeued: 0,
        message: 'Every recipient already has a successful send in job results or CRM for this template in the job time window.',
      })
    }

    const priorSuccessCount = recipients.length - remaining.length
    const priorFailedCount = typeof resultJson.failed === 'number' ? resultJson.failed : 0

    const { broadcastProgress: _bp, lastChunk: _lc, ...history } = resultJson

    const { error: upErr } = await supabase
      .from('scheduled_broadcasts')
      .update({
        status: 'pending',
        started_at: null,
        completed_at: null,
        error_message: null,
        scheduled_at: new Date().toISOString(),
        result_json: {
          ...history,
          broadcastProgress: {
            remainingRecipients: remaining,
            phoneAttempts: {},
            sentTotal: priorSuccessCount,
            failedDeliveryCount: priorFailedCount,
            givenUp: [],
          },
          resumedAt: new Date().toISOString(),
          priorStatus: row.status,
        } as never,
      } as never)
      .eq('id', id)

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({
      requeued: remaining.length,
      skippedAlreadySent: priorSuccessCount,
      message: `Re-queued ${remaining.length} missing recipient(s). Run "Process scheduled now" or wait for cron.`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to resume broadcast' },
      { status: 500 }
    )
  }
}
