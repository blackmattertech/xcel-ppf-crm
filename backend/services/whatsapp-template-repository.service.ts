/**
 * Repository: store/load drafts, remote templates, webhook events, status history.
 */

import { createServiceClient } from '@/lib/supabase/service'
import type { TemplateDraftRow, TemplateWebhookEventRow, TemplateStatusHistoryRow } from '@/shared/whatsapp-template-types'

type SupabaseClient = ReturnType<typeof createServiceClient>
function fromTable(supabase: SupabaseClient, table: string) {
  return (supabase as { from: (t: string) => ReturnType<SupabaseClient['from']> }).from(table)
}

export async function insertDraft(row: Partial<Record<keyof TemplateDraftRow, unknown>>): Promise<TemplateDraftRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_drafts')
    .insert(row as never)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as TemplateDraftRow
}

export async function updateDraft(
  id: string,
  updates: Partial<Record<keyof TemplateDraftRow, unknown>>
): Promise<TemplateDraftRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_drafts')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as TemplateDraftRow
}

export async function getDraftById(id: string): Promise<TemplateDraftRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as unknown as TemplateDraftRow | null
}

export async function listDrafts(filters?: { createdBy?: string; submitState?: string }): Promise<TemplateDraftRow[]> {
  const supabase = createServiceClient()
  let q = fromTable(supabase, 'whatsapp_template_drafts')
    .select('*')
    .order('updated_at', { ascending: false })
  if (filters?.createdBy) q = q.eq('created_by', filters.createdBy)
  if (filters?.submitState) q = q.eq('submit_state', filters.submitState)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TemplateDraftRow[]
}

export async function deleteDraft(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await fromTable(supabase, 'whatsapp_template_drafts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function insertWebhookEvent(row: {
  waba_id: string
  meta_template_id?: string | null
  event_type: string
  dedupe_key: string
  payload_json: unknown
}): Promise<TemplateWebhookEventRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_webhook_events')
    .insert(row as never)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as TemplateWebhookEventRow
}

export async function getWebhookEventByDedupeKey(dedupeKey: string): Promise<TemplateWebhookEventRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_webhook_events')
    .select('*')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as unknown as TemplateWebhookEventRow | null
}

export async function markWebhookEventProcessed(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await fromTable(supabase, 'whatsapp_template_webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() } as never)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function insertStatusHistory(row: {
  whatsapp_template_id: string
  old_status?: string | null
  new_status?: string | null
  old_category?: string | null
  new_category?: string | null
  source: 'webhook' | 'poll' | 'manual'
  reason?: string | null
}): Promise<TemplateStatusHistoryRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_status_history')
    .insert(row as never)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as TemplateStatusHistoryRow
}

export async function getTemplateByMetaId(metaTemplateId: string): Promise<Record<string, unknown> | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('meta_template_id', metaTemplateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

export async function getTemplateById(id: string): Promise<Record<string, unknown> | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('whatsapp_templates').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

export async function updateTemplateStatus(
  id: string,
  updates: {
    meta_status?: string
    correct_category?: string | null
    last_sync_at?: string
    rejection_reason?: string | null
  }
): Promise<void> {
  const supabase = createServiceClient()
  const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
  if (updates.meta_status) payload.status = updates.meta_status
  const { error } = await supabase.from('whatsapp_templates').update(payload as never).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function insertTemplate(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('whatsapp_templates').insert(row as never).select().single()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown>
}

export async function getStatusHistoryByTemplateId(templateId: string): Promise<TemplateStatusHistoryRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_status_history')
    .select('*')
    .eq('whatsapp_template_id', templateId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TemplateStatusHistoryRow[]
}

export async function getWebhookEventsByMetaTemplateId(metaTemplateId: string): Promise<TemplateWebhookEventRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await fromTable(supabase, 'whatsapp_template_webhook_events')
    .select('*')
    .eq('meta_template_id', metaTemplateId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TemplateWebhookEventRow[]
}
