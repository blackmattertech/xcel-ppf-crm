import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { sendTemplateBulk } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { saveOutgoingMessagesBatch } from '@/backend/services/whatsapp-chat.service'
import { createServiceClient } from '@/lib/supabase/service'
import type { ResolvedBroadcastPayload } from '@/backend/services/whatsapp-broadcast-resolve'
import { getTemplateByNameAndLanguage } from '@/backend/services/whatsapp-template.service'
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
 * Processes multiple jobs per request within a time budget.
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

  // Tuneable knobs: keep within serverless / GH Actions 5m timeout.
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

  type ScheduledRow = { id: string; scheduled_at: string; payload_json: unknown; created_by: string | null }
  const results: Array<{ id: string; status: string; sent?: number; failed?: number; error?: string }> = []

  let processed = 0
  let fetched = 0

  while (processed < maxJobs && (Date.now() - startedAt) < maxRuntimeMs) {
    const remaining = maxJobs - processed
    const batchSize = Math.min(10, remaining)

    const { data: rows, error: fetchError } = await supabase
      .from('scheduled_broadcasts')
      .select('id, scheduled_at, payload_json, created_by')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(batchSize)

    if (fetchError) {
      if (fetchError.code === '42P01') {
        return NextResponse.json({ error: 'scheduled_broadcasts table not found. Run migration 031.' }, { status: 503 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const jobs = (rows ?? []) as ScheduledRow[]
    fetched += jobs.length
    if (jobs.length === 0) break

    for (const job of jobs) {
      if (processed >= maxJobs) break
      if ((Date.now() - startedAt) >= maxRuntimeMs) break

      const payload = job.payload_json as ResolvedBroadcastPayload | null
      if (!payload?.templateName || !Array.isArray(payload.recipients) || payload.recipients.length === 0) {
        await supabase
          .from('scheduled_broadcasts')
          .update({
            status: 'failed',
            error_message: 'Invalid payload: missing templateName or recipients',
            completed_at: new Date().toISOString(),
          } as never)
          .eq('id', job.id)
        results.push({ id: job.id, status: 'failed', error: 'Invalid payload' })
        processed++
        continue
      }

      await supabase
        .from('scheduled_broadcasts')
        .update({ status: 'processing', started_at: new Date().toISOString() } as never)
        .eq('id', job.id)

      try {
        const { config } = await getResolvedWhatsAppConfig(job.created_by ?? undefined)
        if (!config) {
          throw new Error('WhatsApp API not configured (set env vars or link in Settings → Integrations)')
        }

        const templateRow = await getTemplateByNameAndLanguage(payload.templateName, payload.templateLanguage)
        const metaTemplateId = templateRow?.meta_id ?? null
        const result = await sendTemplateBulk(
          payload.recipients,
          payload.templateName,
          payload.templateLanguage,
          {
            delayMs: payload.delayMs,
            defaultCountryCode: payload.defaultCountryCode ?? '91',
            headerParameters: payload.headerParameters,
            headerFormat: payload.headerFormat,
            headerMediaId: payload.headerMediaId ?? undefined,
            config,
          }
        )

        const bodyForChat = `[Template: ${payload.templateName}]`
        const toSave: Array<{
          leadId: null
          phone: string
          body: string
          metaMessageId?: string | null
          templateName?: string | null
          metaTemplateId?: string | null
        }> = []
        for (let i = 0; i < result.results.length; i++) {
          const r = result.results[i]
          if (r.success) {
            const recipient = payload.recipients[i]
            toSave.push({
              leadId: null,
              phone: recipient?.phone ?? r.phone ?? '',
              body: bodyForChat,
              metaMessageId: r.messageId ?? undefined,
              templateName: payload.templateName,
              metaTemplateId,
            })
          }
        }
        await saveOutgoingMessagesBatch(
          toSave.filter((r) => (r.phone && String(r.phone).replace(/\D/g, '').length > 0))
        )

        await supabase
          .from('scheduled_broadcasts')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result_json: { sent: result.sent, failed: result.failed, results: result.results },
          } as never)
          .eq('id', job.id)

        results.push({
          id: job.id,
          status: 'completed',
          sent: result.sent,
          failed: result.failed,
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
          .eq('id', job.id)
        results.push({ id: job.id, status: 'failed', error: errMsg })
      }

      processed++
    }
  }

  // If nothing was due at all, return helpful counts like before.
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
      debug: { pendingCount: pendingCount ?? 0, dueCount: dueCount ?? 0, maxJobs, maxRuntimeMs, fetched },
    })
  }

  // Remaining due jobs after this run (best effort).
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
      fetched,
      runtimeMs: Date.now() - startedAt,
      remainingDue: remainingDue ?? 0,
    },
  })
}
