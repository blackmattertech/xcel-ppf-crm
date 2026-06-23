/**
 * WhatsApp automation batch processor: chunked sends with persisted progress
 * so cron runs continue until every enrolled lead receives the trigger message.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { computeEnrollmentDay, todayIstDateString } from '@/shared/whatsapp-automation-ist'
import { getFlowById } from '@/backend/services/whatsapp-automation.service'
import { getTemplateById } from '@/backend/services/whatsapp-template.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import {
  sendTemplateBulk,
  sendWhatsAppBulk,
  sendWhatsAppMedia,
  type BulkSendResult,
  type WhatsAppConfig,
} from '@/backend/services/whatsapp.service'
import { saveOutgoingMessagesBatch } from '@/backend/services/whatsapp-chat.service'
import type {
  AutomationBatchPayload,
  AutomationBatchProgress,
  AutomationEnrollment,
  AutomationFlow,
  AutomationFlowWithTriggers,
  AutomationRecipient,
  AutomationTrigger,
} from '@/shared/whatsapp-automation-types'

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

function phoneKey(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : d
}

function isPermanentError(error: string | undefined, errorCode?: number): boolean {
  if (!error) return false
  if (errorCode === 131047) return true
  if (/invalid phone/i.test(error)) return true
  if (/re-engagement|template required|24.?hour|session.*expired/i.test(error)) return true
  return false
}

function isTransientError(error: string | undefined, errorCode?: number): boolean {
  if (errorCode === 130429 || errorCode === 429) return true
  if (/rate limit|timeout|HTTP 5|throughput exceeded/i.test(error || '')) return true
  return false
}

function parseProgress(resultJson: unknown): AutomationBatchProgress | null {
  if (!resultJson || typeof resultJson !== 'object') return null
  const root = resultJson as Record<string, unknown>
  const p = root.broadcastProgress
  if (!p || typeof p !== 'object') return null
  const pr = p as Record<string, unknown>
  if (!Array.isArray(pr.remainingRecipients)) return null
  return {
    remainingRecipients: pr.remainingRecipients as AutomationRecipient[],
    phoneAttempts:
      pr.phoneAttempts && typeof pr.phoneAttempts === 'object' && !Array.isArray(pr.phoneAttempts)
        ? (pr.phoneAttempts as Record<string, number>)
        : {},
    sentTotal: typeof pr.sentTotal === 'number' ? pr.sentTotal : 0,
    failedDeliveryCount: typeof pr.failedDeliveryCount === 'number' ? pr.failedDeliveryCount : 0,
    givenUp: Array.isArray(pr.givenUp) ? (pr.givenUp as AutomationBatchProgress['givenUp']) : [],
  }
}

function stripProgressForHistory(resultJson: Record<string, unknown> | null): Record<string, unknown> {
  if (!resultJson) return {}
  const { broadcastProgress: _b, lastChunk: _l, ...rest } = resultJson
  return rest
}

async function buildBatchPayload(
  trigger: AutomationTrigger,
  recipients: AutomationRecipient[]
): Promise<AutomationBatchPayload> {
  const base: AutomationBatchPayload = {
    messageType: trigger.message_type,
    defaultCountryCode: '91',
    recipients,
  }

  if (trigger.message_type === 'template' && trigger.template_id) {
    const tpl = await getTemplateById(trigger.template_id)
    if (!tpl) throw new Error('Template not found for trigger')
    return {
      ...base,
      templateName: tpl.name,
      templateLanguage: tpl.language || 'en',
      bodyParameters: (trigger.body_parameters as string[] | null) ?? undefined,
      headerParameters: (trigger.header_parameters as string[] | null) ?? undefined,
      headerFormat: tpl.header_format as AutomationBatchPayload['headerFormat'],
      headerMediaId: tpl.header_media_id,
    }
  }

  return {
    ...base,
    messageBody: trigger.message_body ?? undefined,
    mediaUrl: trigger.media_url ?? undefined,
    mediaMimeType: trigger.media_mime_type ?? undefined,
    mediaFileName: trigger.media_file_name ?? undefined,
    mediaMetaId: trigger.media_meta_id ?? undefined,
  }
}

export async function queueTriggerBatchForEnrollments(params: {
  flow: AutomationFlow | AutomationFlowWithTriggers
  trigger: AutomationTrigger
  enrollments: AutomationEnrollment[]
  runDate: string
}): Promise<string | null> {
  const { flow, trigger, enrollments, runDate } = params
  if (enrollments.length === 0) return null

  const supabase = createServiceClient()
  const recipients: AutomationRecipient[] = []

  for (const en of enrollments) {
    const day = computeEnrollmentDay(en.started_at)
    if (day !== trigger.day_offset) continue
    if (en.cycle_number < 1) continue

    const { data: lead } = await supabase
      .from('leads')
      .select('id, phone, name')
      .eq('id', en.lead_id)
      .maybeSingle()
    if (!lead) continue
    const phone = (lead as { phone: string }).phone
    if (!phone?.trim()) continue

    recipients.push({
      enrollmentId: en.id,
      leadId: en.lead_id,
      phone,
      name: (lead as { name?: string }).name,
      cycleNumber: en.cycle_number,
    })
  }

  if (recipients.length === 0) return null

  const cycleNumber = Math.max(...recipients.map((r) => r.cycleNumber))

  const { data: existing } = await supabase
    .from('whatsapp_automation_trigger_batches')
    .select('id, payload_json, result_json')
    .eq('flow_id', flow.id)
    .eq('trigger_id', trigger.id)
    .eq('run_date', runDate)
    .eq('cycle_number', cycleNumber)
    .maybeSingle()

  if (existing) {
    const batchId = (existing as { id: string }).id
    const payload = (existing as { payload_json: AutomationBatchPayload }).payload_json
    const progress = parseProgress((existing as { result_json: unknown }).result_json)
    const existingIds = new Set(
      [...(payload?.recipients || []), ...(progress?.remainingRecipients || [])].map((r) => r.leadId)
    )
    const toAdd = recipients.filter((r) => !existingIds.has(r.leadId))
    if (toAdd.length === 0) return batchId

    const mergedRecipients = [...(progress?.remainingRecipients || payload?.recipients || []), ...toAdd]
    const newPayload = await buildBatchPayload(trigger, mergedRecipients)

    await supabase
      .from('whatsapp_automation_trigger_batches')
      // @ts-ignore
      .update({
        payload_json: newPayload,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        result_json: progress
          ? {
              broadcastProgress: { ...progress, remainingRecipients: mergedRecipients },
            }
          : null,
      })
      .eq('id', batchId)

    return batchId
  }

  const payload = await buildBatchPayload(trigger, recipients)
  const { data, error } = await supabase
    .from('whatsapp_automation_trigger_batches')
    // @ts-ignore
    .insert({
      flow_id: flow.id,
      trigger_id: trigger.id,
      run_date: runDate,
      cycle_number: cycleNumber,
      scheduled_at: new Date().toISOString(),
      status: 'pending',
      payload_json: payload,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create trigger batch: ${error.message}`)
  return (data as { id: string }).id
}

export async function queueDueTriggerBatches(): Promise<number> {
  const supabase = createServiceClient()
  const runDate = todayIstDateString()
  let queued = 0

  const { data: enrollments, error } = await supabase
    .from('whatsapp_automation_lead_enrollments')
    .select('id, flow_id, lead_id, started_at, cycle_number, status')
    .eq('status', 'active')

  if (error) throw new Error(`Failed to fetch enrollments: ${error.message}`)

  const byFlowTrigger = new Map<string, { flow: AutomationFlowWithTriggers; trigger: AutomationTrigger; enrollments: AutomationEnrollment[] }>()

  for (const row of enrollments || []) {
    const en = row as AutomationEnrollment
    const currentDay = computeEnrollmentDay(en.started_at)
    const flow = await getFlowById(en.flow_id)
    if (!flow || !flow.is_active) continue

    if (currentDay >= flow.cycle_days) {
      await completeOrRestartEnrollment(en, flow)
      continue
    }

    const trigger = flow.triggers.find((t) => t.day_offset === currentDay)
    if (!trigger) continue

    const key = `${flow.id}:${trigger.id}:${en.cycle_number}`
    const entry = byFlowTrigger.get(key) || { flow, trigger, enrollments: [] }
    entry.enrollments.push(en)
    byFlowTrigger.set(key, entry)
  }

  for (const { flow, trigger, enrollments: ens } of byFlowTrigger.values()) {
    const batchId = await queueTriggerBatchForEnrollments({ flow, trigger, enrollments: ens, runDate })
    if (batchId) queued++
  }

  return queued
}

async function completeOrRestartEnrollment(
  enrollment: AutomationEnrollment,
  flow: AutomationFlowWithTriggers
): Promise<void> {
  const supabase = createServiceClient()
  const currentDay = computeEnrollmentDay(enrollment.started_at)

  if (currentDay < flow.cycle_days) return

  if (flow.restart_on_complete) {
    await supabase
      .from('whatsapp_automation_lead_enrollments')
      // @ts-ignore
      .update({
        started_at: new Date().toISOString(),
        cycle_number: enrollment.cycle_number + 1,
      })
      .eq('id', enrollment.id)
  } else {
    await supabase
      .from('whatsapp_automation_lead_enrollments')
      // @ts-ignore
      .update({ status: 'completed' })
      .eq('id', enrollment.id)
  }
}

async function writeSendLog(params: {
  supabase: SupabaseClient
  batchId: string
  triggerId: string
  recipient: AutomationRecipient
  status: 'sent' | 'failed' | 'retrying'
  wamid?: string
  error?: string
  attemptCount: number
}): Promise<void> {
  const { supabase, batchId, triggerId, recipient, status, wamid, error, attemptCount } = params
  await supabase.from('whatsapp_automation_send_log').upsert(
    {
      batch_id: batchId,
      enrollment_id: recipient.enrollmentId,
      trigger_id: triggerId,
      lead_id: recipient.leadId,
      phone: recipient.phone,
      status,
      wamid: wamid ?? null,
      error: error ?? null,
      attempt_count: attemptCount,
      cycle_number: recipient.cycleNumber,
      sent_at: new Date().toISOString(),
    } as never,
    { onConflict: 'batch_id,lead_id', ignoreDuplicates: false }
  )
}

async function sendChunk(
  chunk: AutomationRecipient[],
  payload: AutomationBatchPayload,
  config: WhatsAppConfig
): Promise<BulkSendResult> {
  const delayMs = Math.max(50, envPositiveInt('WHATSAPP_SCHEDULED_MIN_DELAY_MS', 400))
  const defaultCountryCode = payload.defaultCountryCode ?? '91'

  if (payload.messageType === 'template' && payload.templateName) {
    return sendTemplateBulk(
      chunk.map((r) => ({ phone: r.phone, name: r.name, bodyParameters: payload.bodyParameters })),
      payload.templateName,
      payload.templateLanguage || 'en',
      {
        delayMs,
        defaultCountryCode,
        headerParameters: payload.headerParameters,
        headerFormat: payload.headerFormat,
        headerMediaId: payload.headerMediaId ?? undefined,
        config,
      }
    )
  }

  if (payload.messageType === 'text') {
    return sendWhatsAppBulk(
      chunk.map((r) => ({ phone: r.phone })),
      payload.messageBody || '',
      { delayMs, defaultCountryCode, config }
    )
  }

  const results: BulkSendResult['results'] = []
  let sent = 0
  let failed = 0
  const mediaType = payload.messageType === 'video' ? 'video' : 'image'

  for (const r of chunk) {
    const result = await sendWhatsAppMedia(
      r.phone,
      {
        mediaType,
        mediaUrl: payload.mediaUrl || '',
        fileName: payload.mediaFileName,
        caption: payload.messageBody,
        defaultCountryCode,
      },
      config
    )
    results.push({
      phone: r.phone,
      success: result.success,
      error: result.error,
      ...(result.messageId && { messageId: result.messageId }),
      ...(result.errorCode !== undefined && { errorCode: result.errorCode }),
    })
    if (result.success) sent++
    else failed++
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return { sent, failed, results }
}

export interface AdvanceTriggerBatchParams {
  supabase: SupabaseClient
  batchId: string
  triggerId: string
  payload: AutomationBatchPayload
  existingResultJson: Record<string, unknown> | null
  config: WhatsAppConfig
  globalDeadlineMs: number
}

export interface AdvanceTriggerBatchOutcome {
  finalStatus: 'completed' | 'pending' | 'failed'
  sentDelta: number
  failedDelta: number
  error?: string
}

export async function advanceTriggerBatch(
  params: AdvanceTriggerBatchParams
): Promise<AdvanceTriggerBatchOutcome> {
  const { supabase, batchId, triggerId, payload, existingResultJson, config, globalDeadlineMs } = params

  const chunkSize = Math.min(500, Math.max(5, envPositiveInt('WHATSAPP_SCHEDULED_CHUNK_SIZE', 40)))
  const maxAttempts = Math.min(
    100,
    Math.max(1, envPositiveInt('WHATSAPP_AUTOMATION_MAX_ATTEMPTS_PER_PHONE', 25))
  )

  const prior = parseProgress(existingResultJson)
  let remaining = prior?.remainingRecipients?.length
    ? [...prior.remainingRecipients]
    : [...payload.recipients]
  const phoneAttempts: Record<string, number> = { ...(prior?.phoneAttempts ?? {}) }
  const givenUp: AutomationBatchProgress['givenUp'] = [...(prior?.givenUp ?? [])]
  let sentTotal = prior?.sentTotal ?? 0
  let failedDeliveryCount = prior?.failedDeliveryCount ?? 0
  let sentDelta = 0
  let failedDelta = 0

  const bodyForChat =
    payload.messageType === 'template'
      ? `[Template: ${payload.templateName}]`
      : payload.messageBody || `[${payload.messageType}]`

  const heartbeat = async () => {
    await supabase
      .from('whatsapp_automation_trigger_batches')
      .update({ started_at: new Date().toISOString() } as never)
      .eq('id', batchId)
  }

  while (remaining.length > 0 && Date.now() < globalDeadlineMs - 1500) {
    const chunk = remaining.slice(0, chunkSize)
    await heartbeat()

    const result = await sendChunk(chunk, payload, config)
    const toSave: Array<{
      leadId: string | null
      phone: string
      body: string
      metaMessageId?: string | null
      templateName?: string | null
      initialStatus?: 'sent'
    }> = []

    const retryFront: AutomationRecipient[] = []
    const rest = remaining.slice(chunk.length)

    for (let i = 0; i < chunk.length; i++) {
      const recipient = chunk[i]
      const r = result.results[i]
      if (!recipient || !r) continue

      const key = phoneKey(recipient.phone)
      const attempt = (phoneAttempts[key] ?? 0) + 1
      phoneAttempts[key] = attempt

      if (r.success) {
        sentTotal += 1
        sentDelta += 1
        toSave.push({
          leadId: recipient.leadId,
          phone: recipient.phone,
          body: bodyForChat,
          metaMessageId: r.messageId ?? undefined,
          templateName: payload.templateName ?? null,
          initialStatus: 'sent',
        })
        await writeSendLog({
          supabase,
          batchId,
          triggerId,
          recipient,
          status: 'sent',
          wamid: r.messageId,
          attemptCount: attempt,
        })
      } else {
        failedDeliveryCount += 1
        failedDelta += 1
        const err = typeof r.error === 'string' ? r.error : 'Send failed'
        const errorCode = (r as { errorCode?: number }).errorCode
        const permanent = isPermanentError(err, errorCode)
        const transient = isTransientError(err, errorCode)

        if (permanent || (!transient && attempt >= 3)) {
          givenUp.push({ phone: recipient.phone, leadId: recipient.leadId, lastError: err })
          await writeSendLog({
            supabase,
            batchId,
            triggerId,
            recipient,
            status: 'failed',
            error: err,
            attemptCount: attempt,
          })
        } else if (attempt >= maxAttempts) {
          givenUp.push({ phone: recipient.phone, leadId: recipient.leadId, lastError: err })
          await writeSendLog({
            supabase,
            batchId,
            triggerId,
            recipient,
            status: 'failed',
            error: err,
            attemptCount: attempt,
          })
        } else {
          retryFront.push(recipient)
          await writeSendLog({
            supabase,
            batchId,
            triggerId,
            recipient,
            status: 'retrying',
            error: err,
            attemptCount: attempt,
          })
        }
      }
    }

    await saveOutgoingMessagesBatch(
      toSave.filter((row) => row.phone && String(row.phone).replace(/\D/g, '').length > 0)
    )

    remaining = [...retryFront, ...rest]

    const history = stripProgressForHistory(
      existingResultJson && typeof existingResultJson === 'object' ? existingResultJson : null
    )

    if (remaining.length === 0) {
      await supabase
        .from('whatsapp_automation_trigger_batches')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: givenUp.length
            ? `Stopped after retries for ${givenUp.length} lead(s). See result_json.givenUp.`
            : null,
          result_json: {
            ...history,
            sent: sentTotal,
            failed: failedDeliveryCount,
            givenUp,
          } as never,
        } as never)
        .eq('id', batchId)

      return {
        finalStatus: 'completed',
        sentDelta,
        failedDelta,
        error: givenUp.length ? `Some leads exceeded retry limit (${givenUp.length}).` : undefined,
      }
    }

    await supabase
      .from('whatsapp_automation_trigger_batches')
      .update({
        result_json: {
          ...history,
          broadcastProgress: {
            remainingRecipients: remaining,
            phoneAttempts,
            sentTotal,
            failedDeliveryCount,
            givenUp,
          },
          lastChunk: { at: new Date().toISOString(), chunkSize: chunk.length },
        } as never,
      } as never)
      .eq('id', batchId)
  }

  if (remaining.length === 0) {
    return { finalStatus: 'completed', sentDelta, failedDelta }
  }

  const history = stripProgressForHistory(
    existingResultJson && typeof existingResultJson === 'object' ? existingResultJson : null
  )

  await supabase
    .from('whatsapp_automation_trigger_batches')
    .update({
      status: 'pending',
      started_at: null,
      result_json: {
        ...history,
        broadcastProgress: {
          remainingRecipients: remaining,
          phoneAttempts,
          sentTotal,
          failedDeliveryCount,
          givenUp,
        },
      } as never,
    } as never)
    .eq('id', batchId)

  return { finalStatus: 'pending', sentDelta, failedDelta }
}

export async function resolveAutomationWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const { config } = await getResolvedWhatsAppConfig()
  return config
}
