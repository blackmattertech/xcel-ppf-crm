/**
 * Ingest Meta template webhooks: message_template_status_update, template_category_update.
 * Dedupe by dedupe_key; idempotent; update local template and append status history.
 */

import { createHash } from 'crypto'
import * as repo from './whatsapp-template-repository.service'

function toDedupeKey(wabaId: string, metaTemplateId: string | null, eventType: string, payload: unknown): string {
  const raw = `${wabaId}|${metaTemplateId ?? ''}|${eventType}|${JSON.stringify(payload)}`
  return createHash('sha256').update(raw).digest('hex')
}

export interface ProcessWebhookParams {
  wabaId: string
  eventType: string
  payload: Record<string, unknown>
}

/**
 * Process a template webhook event: store raw, dedupe, update template, append history.
 */
export async function processTemplateWebhook(params: ProcessWebhookParams): Promise<{ processed: boolean; error?: string }> {
  const { wabaId, eventType, payload } = params
  const metaTemplateId = (payload.message_template_id ?? payload.template_id ?? payload.id) as string | undefined
  const dedupeKey = toDedupeKey(wabaId, metaTemplateId ?? null, eventType, payload)

  const existing = await repo.getWebhookEventByDedupeKey(dedupeKey)
  if (existing?.processed) {
    return { processed: true }
  }

  let eventId: string | null = null
  try {
    const inserted = await repo.insertWebhookEvent({
      waba_id: wabaId,
      meta_template_id: metaTemplateId ?? null,
      event_type: eventType,
      dedupe_key: dedupeKey,
      payload_json: payload,
    })
    eventId = inserted?.id ?? null
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    if (err.includes('duplicate') || err.includes('unique')) {
      const existingEvent = await repo.getWebhookEventByDedupeKey(dedupeKey)
      if (existingEvent?.processed) return { processed: true }
      eventId = existingEvent?.id ?? null
    } else {
      return { processed: false, error: err }
    }
  }

  const templateRecord = metaTemplateId ? await repo.getTemplateByMetaId(metaTemplateId) : null
  if (!templateRecord?.id) {
    if (eventId) await repo.markWebhookEventProcessed(eventId)
    return { processed: true }
  }

  const templateId = templateRecord.id as string
  const oldStatus = (templateRecord.meta_status ?? templateRecord.status) as string | undefined
  const oldCategory = (templateRecord.correct_category ?? templateRecord.category) as string | undefined

  let newStatus = oldStatus
  let newCategory = oldCategory
  let reason: string | null = null

  if (eventType === 'message_template_status_update' || payload.event === 'message_template_status_update') {
    newStatus = (payload.status as string) ?? newStatus
    reason = (payload.rejection_reason as string) ?? null
  }
  if (eventType === 'template_category_update' || payload.event === 'template_category_update') {
    newCategory = (payload.correct_category ?? payload.category) as string ?? newCategory
  }

  if (newStatus !== oldStatus || newCategory !== oldCategory) {
    await repo.updateTemplateStatus(templateId, {
      meta_status: newStatus,
      correct_category: newCategory ?? undefined,
      last_sync_at: new Date().toISOString(),
      rejection_reason: reason ?? undefined,
    })
    await repo.insertStatusHistory({
      whatsapp_template_id: templateId,
      old_status: oldStatus ?? null,
      new_status: newStatus ?? null,
      old_category: oldCategory ?? null,
      new_category: newCategory ?? null,
      source: 'webhook',
      reason,
    })
  }

  if (eventId) await repo.markWebhookEventProcessed(eventId)
  return { processed: true }
}
