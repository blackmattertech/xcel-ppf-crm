import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { createServiceClient } from '@/lib/supabase/service'
import type { ResolvedBroadcastPayload } from '@/backend/services/whatsapp-broadcast-resolve'
import { getTemplateByNameAndLanguage } from '@/backend/services/whatsapp-template.service'
import { advanceScheduledBroadcastJob } from '@/backend/services/whatsapp-scheduled-broadcast.service'

function processScheduledSecrets(): string[] {
  const a = process.env.WHATSAPP_PROCESS_SCHEDULED_SECRET?.trim()
  const b = process.env.CRON_SECRET?.trim()
  return [a, b].filter(Boolean) as string[]
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

/**
 * Process due scheduled broadcasts (status=pending, scheduled_at <= now).
 * Auth: either logged-in user OR query param secret (for cron).
 * Example cron URL: GET /api/marketing/whatsapp/process-scheduled?secret=YOUR_SECRET
 * Set WHATSAPP_PROCESS_SCHEDULED_SECRET or CRON_SECRET in env.
 *
 * Large lists: sends in chunks with `result_json.broadcastProgress` so each cron run continues
 * until every number is sent or hits WHATSAPP_SCHEDULED_MAX_ATTEMPTS_PER_PHONE (default 25).
 * Tune: WHATSAPP_SCHEDULED_CHUNK_SIZE, WHATSAPP_SCHEDULED_MIN_DELAY_MS.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const secrets = processScheduledSecrets()
  const allowedBySecret =
    !!secret && secrets.length > 0 && secrets.includes(secret.trim())

  if (!allowedBySecret) {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
  }

  const supabase = createServiceClient()
  const nowIso = new Date().toISOString()

  const maxJobs = Math.min(50, Math.max(1, parsePositiveInt(url.searchParams.get('maxJobs'), 20)))
  const maxRuntimeMs = Math.min(260000, Math.max(10000, parsePositiveInt(url.searchParams.get('maxRuntimeMs'), 230000)))
  const startedAt = Date.now()

  // Recover broadcasts stuck in processing (timeouts/restarts). Re-queue after 20 minutes.
  const staleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  await supabase
    .from('scheduled_broadcasts')
    .update({ status: 'pending', error_message: null } as never)
    .eq('status', 'processing')
    .lt('started_at', staleCutoff)

  type ScheduledRow = {
    id: string
    scheduled_at: string
    payload_json: unknown
    created_by: string | null
    result_json: unknown
  }

  const results: Array<{
    id: string
    status: string
    sent?: number
    failed?: number
    error?: string
    note?: string
  }> = []

  let processed = 0

  while (processed < maxJobs && Date.now() - startedAt < maxRuntimeMs) {
    const { data: candidate, error: peekError } = await supabase
      .from('scheduled_broadcasts')
      .select('id, scheduled_at, payload_json, created_by, result_json')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (peekError) {
      if (peekError.code === '42P01') {
        return NextResponse.json({ error: 'scheduled_broadcasts table not found. Run migration 031.' }, { status: 503 })
      }
      return NextResponse.json({ error: peekError.message }, { status: 500 })
    }

    if (!candidate) break

    const job = candidate as ScheduledRow

    const { data: claimed, error: claimError } = await supabase
      .from('scheduled_broadcasts')
      .update({ status: 'processing', started_at: new Date().toISOString() } as never)
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id, scheduled_at, payload_json, created_by, result_json')
      .maybeSingle()

    if (claimError || !claimed) {
      continue
    }

    const claimedRow = claimed as ScheduledRow
    const payload = claimedRow.payload_json as ResolvedBroadcastPayload | null
    if (!payload?.templateName || !Array.isArray(payload.recipients) || payload.recipients.length === 0) {
      await supabase
        .from('scheduled_broadcasts')
        .update({
          status: 'failed',
          error_message: 'Invalid payload: missing templateName or recipients',
          completed_at: new Date().toISOString(),
        } as never)
        .eq('id', claimedRow.id)
      results.push({ id: claimedRow.id, status: 'failed', error: 'Invalid payload' })
      processed++
      continue
    }

    try {
      const { config } = await getResolvedWhatsAppConfig(claimedRow.created_by ?? undefined)
      if (!config) {
        throw new Error('WhatsApp API not configured (set env vars or link in Settings → Integrations)')
      }

      const templateRow = await getTemplateByNameAndLanguage(payload.templateName, payload.templateLanguage)
      const metaTemplateId = templateRow?.meta_id ?? null

      // Per job: up to ~4m of sending from claim time, but never past this HTTP request's total budget.
      const perJobCapMs = Math.min(240_000, Math.max(30_000, maxRuntimeMs))
      const globalDeadlineMs = Math.min(startedAt + maxRuntimeMs, Date.now() + perJobCapMs)
      const outcome = await advanceScheduledBroadcastJob({
        supabase,
        jobId: claimedRow.id,
        payload,
        existingResultJson:
          claimedRow.result_json && typeof claimedRow.result_json === 'object'
            ? (claimedRow.result_json as Record<string, unknown>)
            : null,
        config,
        metaTemplateId,
        globalDeadlineMs,
      })

      results.push({
        id: claimedRow.id,
        status: outcome.finalStatus,
        sent: outcome.sentDelta,
        failed: outcome.failedDelta,
        error: outcome.error,
        note:
          outcome.finalStatus === 'pending'
            ? 'Partial send; progress saved — next cron run continues remaining recipients.'
            : undefined,
      })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      await supabase
        .from('scheduled_broadcasts')
        .update({
          status: 'failed',
          error_message: errMsg,
          completed_at: new Date().toISOString(),
        } as never)
        .eq('id', claimedRow.id)
      results.push({ id: claimedRow.id, status: 'failed', error: errMsg })
    }

    processed++
  }

  if (results.length === 0) {
    const { count: pendingCount } = await supabase
      .from('scheduled_broadcasts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    const { count: dueCount } = await supabase
      .from('scheduled_broadcasts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
    return NextResponse.json({
      processed: 0,
      message: dueCount === 0 && (pendingCount ?? 0) > 0
        ? 'No due jobs yet. You have pending jobs scheduled for a future time.'
        : 'No due jobs to process.',
      debug: { pendingCount: pendingCount ?? 0, dueCount: dueCount ?? 0, maxJobs, maxRuntimeMs },
    })
  }

  const { count: remainingDue } = await supabase
    .from('scheduled_broadcasts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)

  return NextResponse.json({
    processed: results.length,
    results,
    debug: {
      maxJobs,
      maxRuntimeMs,
      runtimeMs: Date.now() - startedAt,
      remainingDue: remainingDue ?? 0,
    },
  })
}
