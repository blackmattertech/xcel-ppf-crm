import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { sendTemplateBulk } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { saveOutgoingMessage } from '@/backend/services/whatsapp-chat.service'
import { createServiceClient } from '@/lib/supabase/service'
import type { ResolvedBroadcastPayload } from '@/backend/services/whatsapp-broadcast-resolve'

const CRON_SECRET = process.env.WHATSAPP_PROCESS_SCHEDULED_SECRET || process.env.CRON_SECRET

/**
 * Process due scheduled broadcasts (status=pending, scheduled_at <= now).
 * Auth: either logged-in user OR query param secret (for cron).
 * Example cron URL: GET /api/marketing/whatsapp/process-scheduled?secret=YOUR_SECRET
 * Set WHATSAPP_PROCESS_SCHEDULED_SECRET or CRON_SECRET in env.
 * Processes up to 5 jobs per request.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const allowedBySecret = !!CRON_SECRET && secret === CRON_SECRET

  if (!allowedBySecret) {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
  }

  const supabase = createServiceClient()
  type ScheduledRow = { id: string; scheduled_at: string; payload_json: unknown; created_by: string | null }
  const { data: rows, error: fetchError } = await supabase
    .from('scheduled_broadcasts')
    .select('id, scheduled_at, payload_json, created_by')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (fetchError) {
    if (fetchError.code === '42P01') {
      return NextResponse.json({ error: 'scheduled_broadcasts table not found. Run migration 031.' }, { status: 503 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const jobs = (rows ?? []) as ScheduledRow[]
  if (!jobs.length) {
    const now = new Date().toISOString()
    const { count: pendingCount } = await supabase
      .from('scheduled_broadcasts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    const { count: dueCount } = await supabase
      .from('scheduled_broadcasts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('scheduled_at', now)
    return NextResponse.json({
      processed: 0,
      message: dueCount === 0 && (pendingCount ?? 0) > 0
        ? 'No due jobs yet. You have pending jobs scheduled for a future time.'
        : 'No due jobs to process.',
      debug: { pendingCount: pendingCount ?? 0, dueCount: dueCount ?? 0 },
    })
  }

  const results: Array<{ id: string; status: string; sent?: number; failed?: number; error?: string }> = []

  for (const job of jobs) {
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

      const result = await sendTemplateBulk(
        payload.recipients,
        payload.templateName,
        payload.templateLanguage,
        {
          delayMs: payload.delayMs ?? 250,
          defaultCountryCode: payload.defaultCountryCode ?? '91',
          headerParameters: payload.headerParameters,
          headerFormat: payload.headerFormat,
          headerMediaId: payload.headerMediaId ?? undefined,
          config,
        }
      )

      const bodyForChat = `[Template: ${payload.templateName}]`
      for (let i = 0; i < result.results.length; i++) {
        const r = result.results[i]
        if (r.success) {
          const recipient = payload.recipients[i]
          await saveOutgoingMessage({
            leadId: null,
            phone: recipient?.phone ?? r.phone,
            body: bodyForChat,
            metaMessageId: r.messageId ?? undefined,
          })
        }
      }

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
  }

  return NextResponse.json({
    processed: results.length,
    results,
  })
}
