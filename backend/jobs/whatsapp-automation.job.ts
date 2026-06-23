import { createServiceClient } from '@/lib/supabase/service'
import {
  advanceTriggerBatch,
  queueDueTriggerBatches,
  resolveAutomationWhatsAppConfig,
} from '@/backend/services/whatsapp-automation-processor.service'
import type { AutomationBatchPayload } from '@/shared/whatsapp-automation-types'

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

export interface AutomationJobResult {
  queuedBatches: number
  processedBatches: number
  stillPending: number
  remainingLeads: number
  results: Array<{
    id: string
    status: string
    sent?: number
    failed?: number
    error?: string
  }>
}

export async function runWhatsAppAutomationJob(opts?: {
  maxRuntimeMs?: number
  maxBatches?: number
}): Promise<AutomationJobResult> {
  const supabase = createServiceClient()
  const maxRuntimeMs = Math.min(
    260000,
    Math.max(10000, opts?.maxRuntimeMs ?? envPositiveInt('WHATSAPP_AUTOMATION_MAX_RUNTIME_MS', 230000))
  )
  const maxBatches = Math.min(50, Math.max(1, opts?.maxBatches ?? 20))
  const startedAt = Date.now()

  const config = await resolveAutomationWhatsAppConfig()
  if (!config) {
    throw new Error('WhatsApp API not configured')
  }

  const queuedBatches = await queueDueTriggerBatches()

  const staleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  await supabase
    .from('whatsapp_automation_trigger_batches')
    .update({ status: 'pending', error_message: null } as never)
    .eq('status', 'processing')
    .lt('started_at', staleCutoff)

  const results: AutomationJobResult['results'] = []
  let processedBatches = 0

  while (processedBatches < maxBatches && Date.now() - startedAt < maxRuntimeMs) {
    const { data: candidate, error: peekError } = await supabase
      .from('whatsapp_automation_trigger_batches')
      .select('id, trigger_id, payload_json, result_json')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (peekError) throw new Error(peekError.message)
    if (!candidate) break

    const batch = candidate as {
      id: string
      trigger_id: string
      payload_json: AutomationBatchPayload
      result_json: unknown
    }

    const { data: claimed, error: claimError } = await supabase
      .from('whatsapp_automation_trigger_batches')
      .update({ status: 'processing', started_at: new Date().toISOString() } as never)
      .eq('id', batch.id)
      .eq('status', 'pending')
      .select('id, trigger_id, payload_json, result_json')
      .maybeSingle()

    if (claimError) throw new Error(claimError.message)
    if (!claimed) continue

    const claimedBatch = claimed as {
      id: string
      trigger_id: string
      payload_json: AutomationBatchPayload
      result_json: Record<string, unknown> | null
    }

    try {
      const outcome = await advanceTriggerBatch({
        supabase,
        batchId: claimedBatch.id,
        triggerId: claimedBatch.trigger_id,
        payload: claimedBatch.payload_json,
        existingResultJson: claimedBatch.result_json,
        config,
        globalDeadlineMs: startedAt + maxRuntimeMs,
      })

      if (outcome.finalStatus === 'pending') {
        await supabase
          .from('whatsapp_automation_trigger_batches')
          .update({ status: 'pending' } as never)
          .eq('id', claimedBatch.id)
      }

      results.push({
        id: claimedBatch.id,
        status: outcome.finalStatus,
        sent: outcome.sentDelta,
        failed: outcome.failedDelta,
        error: outcome.error,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Batch processing failed'
      await supabase
        .from('whatsapp_automation_trigger_batches')
        .update({ status: 'failed', error_message: msg } as never)
        .eq('id', claimedBatch.id)
      results.push({ id: claimedBatch.id, status: 'failed', error: msg })
    }

    processedBatches++
  }

  const { count: stillPending } = await supabase
    .from('whatsapp_automation_trigger_batches')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  let remainingLeads = 0
  const { data: pendingBatches } = await supabase
    .from('whatsapp_automation_trigger_batches')
    .select('result_json, payload_json')
    .eq('status', 'pending')

  for (const row of pendingBatches || []) {
    const r = row as { result_json?: { broadcastProgress?: { remainingRecipients?: unknown[] } }; payload_json?: { recipients?: unknown[] } }
    const rem = r.result_json?.broadcastProgress?.remainingRecipients
    if (Array.isArray(rem) && rem.length > 0) remainingLeads += rem.length
    else if (Array.isArray(r.payload_json?.recipients)) remainingLeads += r.payload_json!.recipients!.length
  }

  return {
    queuedBatches,
    processedBatches,
    stillPending: stillPending ?? 0,
    remainingLeads,
    results,
  }
}
