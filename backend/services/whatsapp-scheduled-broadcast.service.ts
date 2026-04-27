/**
 * Scheduled template broadcasts: chunk + persist progress so cron runs can finish
 * large recipient lists without timing out or losing state after partial Meta failures.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResolvedBroadcastPayload } from '@/backend/services/whatsapp-broadcast-resolve'
import type { WhatsAppConfig } from '@/backend/services/whatsapp.service'
import { sendTemplateBulk, type BulkSendResult } from '@/backend/services/whatsapp.service'
import { saveOutgoingMessagesBatch } from '@/backend/services/whatsapp-chat.service'

export type ScheduledRecipient = ResolvedBroadcastPayload['recipients'][number]

export interface ScheduledBroadcastProgressState {
  remainingRecipients: ScheduledRecipient[]
  phoneAttempts: Record<string, number>
  sentTotal: number
  failedDeliveryCount: number
  givenUp: Array<{ phone: string; lastError?: string }>
}

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

function parseProgress(resultJson: unknown): ScheduledBroadcastProgressState | null {
  if (!resultJson || typeof resultJson !== 'object') return null
  const root = resultJson as Record<string, unknown>
  const p = root.broadcastProgress
  if (!p || typeof p !== 'object') return null
  const pr = p as Record<string, unknown>
  if (!Array.isArray(pr.remainingRecipients)) return null
  return {
    remainingRecipients: pr.remainingRecipients as ScheduledRecipient[],
    phoneAttempts:
      pr.phoneAttempts && typeof pr.phoneAttempts === 'object' && !Array.isArray(pr.phoneAttempts)
        ? (pr.phoneAttempts as Record<string, number>)
        : {},
    sentTotal: typeof pr.sentTotal === 'number' ? pr.sentTotal : 0,
    failedDeliveryCount: typeof pr.failedDeliveryCount === 'number' ? pr.failedDeliveryCount : 0,
    givenUp: Array.isArray(pr.givenUp) ? (pr.givenUp as ScheduledBroadcastProgressState['givenUp']) : [],
  }
}

function stripProgressForHistory(resultJson: Record<string, unknown> | null): Record<string, unknown> {
  if (!resultJson) return {}
  const { broadcastProgress: _b, lastChunk: _l, ...rest } = resultJson
  return rest
}

export interface AdvanceScheduledBroadcastParams {
  supabase: SupabaseClient
  jobId: string
  payload: ResolvedBroadcastPayload
  existingResultJson: Record<string, unknown> | null
  config: WhatsAppConfig
  metaTemplateId: string | null
  /** Absolute time (Date.now()) when this HTTP invocation must stop sending. */
  globalDeadlineMs: number
}

export interface AdvanceScheduledBroadcastOutcome {
  finalStatus: 'completed' | 'pending' | 'failed'
  sentDelta: number
  failedDelta: number
  error?: string
}

/**
 * Sends chunk(s) of a claimed job while time allows, heartbeats `started_at` so stale recovery
 * does not reset a legitimately long send. If recipients remain when time runs out, sets job
 * back to `pending` with `broadcastProgress` so the next cron tick continues.
 */
export async function advanceScheduledBroadcastJob(
  params: AdvanceScheduledBroadcastParams
): Promise<AdvanceScheduledBroadcastOutcome> {
  const { supabase, jobId, payload, existingResultJson, config, metaTemplateId, globalDeadlineMs } = params

  const chunkSize = Math.min(500, Math.max(5, envPositiveInt('WHATSAPP_SCHEDULED_CHUNK_SIZE', 40)))
  const minDelayMs = Math.min(60000, Math.max(50, envPositiveInt('WHATSAPP_SCHEDULED_MIN_DELAY_MS', 400)))
  const maxAttempts = Math.min(100, Math.max(1, envPositiveInt('WHATSAPP_SCHEDULED_MAX_ATTEMPTS_PER_PHONE', 25)))

  const pacedDelayMs = Math.max(minDelayMs, payload.delayMs ?? 0)

  const prior = parseProgress(existingResultJson)
  let remaining = prior?.remainingRecipients?.length
    ? [...prior.remainingRecipients]
    : [...payload.recipients]
  const phoneAttempts: Record<string, number> = { ...(prior?.phoneAttempts ?? {}) }
  const givenUp: ScheduledBroadcastProgressState['givenUp'] = [...(prior?.givenUp ?? [])]
  let sentTotal = prior?.sentTotal ?? 0
  let failedDeliveryCount = prior?.failedDeliveryCount ?? 0

  const bodyForChat = `[Template: ${payload.templateName}]`
  let sentDelta = 0
  let failedDelta = 0

  const accumulatedResults: BulkSendResult['results'] = []

  const heartbeat = async () => {
    await supabase
      .from('scheduled_broadcasts')
      .update({ started_at: new Date().toISOString() } as never)
      .eq('id', jobId)
  }

  while (remaining.length > 0 && Date.now() < globalDeadlineMs - 1500) {
    const chunk = remaining.slice(0, chunkSize)
    await heartbeat()

    const result = await sendTemplateBulk(chunk, payload.templateName, payload.templateLanguage, {
      delayMs: pacedDelayMs,
      defaultCountryCode: payload.defaultCountryCode ?? '91',
      headerParameters: payload.headerParameters,
      headerFormat: payload.headerFormat,
      headerMediaId: payload.headerMediaId ?? undefined,
      config,
    })

    accumulatedResults.push(...result.results)

    const toSave: Array<{
      leadId: null
      phone: string
      body: string
      metaMessageId?: string | null
      templateName?: string | null
      metaTemplateId?: string | null
      initialStatus?: 'sent'
    }> = []

    const retryFront: ScheduledRecipient[] = []
    const rest = remaining.slice(chunk.length)

    for (let i = 0; i < chunk.length; i++) {
      const recipient = chunk[i]
      const r = result.results[i]
      if (!recipient || !r) continue
      if (r.success) {
        sentTotal += 1
        sentDelta += 1
        toSave.push({
          leadId: null,
          phone: recipient.phone ?? r.phone,
          body: bodyForChat,
          metaMessageId: r.messageId ?? undefined,
          templateName: payload.templateName,
          metaTemplateId,
          initialStatus: 'sent',
        })
      } else {
        failedDeliveryCount += 1
        failedDelta += 1
        const key = phoneKey(recipient.phone)
        const nextAttempt = (phoneAttempts[key] ?? 0) + 1
        phoneAttempts[key] = nextAttempt
        const err = typeof r.error === 'string' ? r.error : 'Send failed'
        if (nextAttempt >= maxAttempts) {
          givenUp.push({ phone: recipient.phone, lastError: err })
        } else {
          retryFront.push(recipient)
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
      const finalResults = accumulatedResults.slice(-2000)
      await supabase
        .from('scheduled_broadcasts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: givenUp.length
            ? `Stopped after ${maxAttempts} tries for ${givenUp.length} number(s). See result_json.givenUp.`
            : null,
          result_json: {
            ...history,
            sent: sentTotal,
            failed: failedDeliveryCount,
            givenUp,
            results: finalResults,
          } as never,
        } as never)
        .eq('id', jobId)

      return {
        finalStatus: 'completed',
        sentDelta,
        failedDelta,
        error: givenUp.length ? `Some numbers exceeded retry limit (${givenUp.length}).` : undefined,
      }
    }

    const progress: ScheduledBroadcastProgressState = {
      remainingRecipients: remaining,
      phoneAttempts,
      sentTotal,
      failedDeliveryCount,
      givenUp,
    }

    await supabase
      .from('scheduled_broadcasts')
      .update({
        result_json: {
          ...history,
          broadcastProgress: progress,
          lastChunk: {
            at: new Date().toISOString(),
            chunkSize: chunk.length,
            sent: result.sent,
            failed: result.failed,
          },
        } as never,
      } as never)
      .eq('id', jobId)
  }

  if (remaining.length === 0) {
    return { finalStatus: 'completed', sentDelta, failedDelta }
  }

  const history = stripProgressForHistory(
    existingResultJson && typeof existingResultJson === 'object' ? existingResultJson : null
  )
  const progress: ScheduledBroadcastProgressState = {
    remainingRecipients: remaining,
    phoneAttempts,
    sentTotal,
    failedDeliveryCount,
    givenUp,
  }

  await supabase
    .from('scheduled_broadcasts')
    .update({
      status: 'pending',
      started_at: null,
      result_json: {
        ...history,
        broadcastProgress: progress,
      } as never,
    } as never)
    .eq('id', jobId)

  return { finalStatus: 'pending', sentDelta, failedDelta }
}
