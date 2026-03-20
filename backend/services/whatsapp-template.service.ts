/**
 * WhatsApp message templates: DB storage, submit to Meta, sync status.
 * Use with whatsapp.service for Meta API (create/list templates, send template message).
 */

import { createServiceClient } from '@/lib/supabase/service'

export type TemplateStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
/** Meta sub-category for UTILITY templates. ORDER_* are predefined formats for order-related messages. */
export type TemplateSubCategory = 'ORDER_DETAILS' | 'ORDER_STATUS' | 'RICH_ORDER_STATUS' | null

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
  text: string
  example?: string
}

export interface WhatsAppTemplateRow {
  id: string
  name: string
  language: string
  category: TemplateCategory
  sub_category?: TemplateSubCategory
  body_text: string
  header_text: string | null
  footer_text: string | null
  header_format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_media_url: string | null
  /** Meta media attachment ID from Resumable Upload API; use when sending template. */
  header_media_id: string | null
  buttons: TemplateButton[] | null
  status: TemplateStatus
  meta_id: string | null
  rejection_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateTemplateInput {
  name: string
  language?: string
  category: TemplateCategory
  sub_category?: TemplateSubCategory
  body_text: string
  header_text?: string | null
  footer_text?: string | null
  header_format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_media_url?: string | null
  /** Meta upload handle/ID from POST /upload-media; stored and used when sending template. */
  header_media_id?: string | null
  buttons?: TemplateButton[] | null
}

/** Template name for Meta: lowercase, numbers, underscores only. */
export function sanitizeTemplateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 512) || 'template'
}

const TABLE_MISSING_MESSAGE = 'The whatsapp_templates table does not exist. Run database/migrations/017_whatsapp_templates.sql in your Supabase project (SQL Editor or migrations).'

function isTableMissingError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42P01' || /relation ["']whatsapp_templates["'] does not exist/i.test(error?.message ?? '')
}

export async function createTemplate(input: CreateTemplateInput, userId: string): Promise<WhatsAppTemplateRow> {
  const supabase = createServiceClient()
  const name = sanitizeTemplateName(input.name)
  const language = (input.language || 'en').replace(/-/g, '_').slice(0, 10)
  const row = {
    name,
    language,
    category: input.category,
    sub_category: input.sub_category ?? null,
    body_text: input.body_text,
    header_text: input.header_text || null,
    footer_text: input.footer_text || null,
    header_format: input.header_format || 'TEXT',
    header_media_url: input.header_media_url || null,
    header_media_id: input.header_media_id || null,
    buttons: input.buttons && input.buttons.length > 0 ? input.buttons : [],
    status: 'draft' as const,
    created_by: userId,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .insert(row as never)
    .select()
    .single()

  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
  return data as WhatsAppTemplateRow
}

export async function getTemplateById(id: string): Promise<WhatsAppTemplateRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('whatsapp_templates').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
  return data as WhatsAppTemplateRow | null
}

export async function listTemplates(filters?: { status?: TemplateStatus; category?: TemplateCategory }): Promise<WhatsAppTemplateRow[]> {
  const supabase = createServiceClient()
  let q = supabase.from('whatsapp_templates').select('*').order('updated_at', { ascending: false })
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.category) q = q.eq('category', filters.category)
  const { data, error } = await q
  if (error) {
    if (isTableMissingError(error)) return []
    throw new Error(error.message)
  }
  return (data || []) as WhatsAppTemplateRow[]
}

/** Get an approved template by name. Use its language as the original when sending to avoid #132001. */
export async function getApprovedTemplateByName(name: string): Promise<WhatsAppTemplateRow | null> {
  const supabase = createServiceClient()
  const normalized = sanitizeTemplateName(name)
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('name', normalized)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isTableMissingError(error)) return null
    throw new Error(error.message)
  }
  return data as WhatsAppTemplateRow | null
}

/** Get any template by name (any status). Use for resolving creation language when sending. */
export async function getTemplateByName(name: string): Promise<WhatsAppTemplateRow | null> {
  const supabase = createServiceClient()
  const normalized = sanitizeTemplateName(name)
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('name', normalized)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isTableMissingError(error)) return null
    throw new Error(error.message)
  }
  return data as WhatsAppTemplateRow | null
}

/** Get template by name and language (for send: use DB header_format and header_media_url). */
export async function getTemplateByNameAndLanguage(
  name: string,
  language: string
): Promise<WhatsAppTemplateRow | null> {
  const supabase = createServiceClient()
  const normalized = sanitizeTemplateName(name)
  const lang = (language || 'en').trim().replace(/-/g, '_').slice(0, 10)
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('name', normalized)
    .eq('language', lang)
    .maybeSingle()
  if (error) {
    if (isTableMissingError(error)) return null
    throw new Error(error.message)
  }
  return data as WhatsAppTemplateRow | null
}

export async function updateTemplateMetaStatus(
  id: string,
  metaId: string | null,
  status: TemplateStatus,
  rejectionReason?: string | null
): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('whatsapp_templates')
    .update({
      meta_id: metaId,
      status,
      rejection_reason: rejectionReason ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id)

  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
}

/** Update template language (and optionally name) to match Meta exactly. Call from sync to avoid #132001. */
export async function updateTemplateMetaLanguage(
  id: string,
  language: string,
  name?: string
): Promise<void> {
  const supabase = createServiceClient()
  const payload: { language: string; name?: string; updated_at: string } = {
    language: language.replace(/-/g, '_').trim().slice(0, 10),
    updated_at: new Date().toISOString(),
  }
  if (name !== undefined) payload.name = sanitizeTemplateName(name)
  const { error } = await supabase.from('whatsapp_templates').update(payload as never).eq('id', id)
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
}

/** Input shape from Meta listMessageTemplatesWithDetails for upsert. */
export interface MetaTemplateDetailInput {
  id: string
  name: string
  language: string
  status: string
  category: string
  body_text: string
  header_format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_text: string | null
  footer_text: string | null
  buttons: Array<{ type: string; text: string; example?: string }>
}

function metaCategoryToLocal(cat: string): TemplateCategory {
  const c = (cat || '').toUpperCase()
  if (c === 'MARKETING' || c === 'UTILITY' || c === 'AUTHENTICATION') return c as TemplateCategory
  return 'UTILITY'
}

function metaStatusToLocal(metaStatus: string): TemplateStatus {
  const s = (metaStatus || '').toLowerCase()
  if (s === 'approved' || s === 'active') return 'approved'
  if (s === 'rejected') return 'rejected'
  return 'pending'
}

/**
 * Upsert a template from Meta full details (sync). Stores all template info in DB so send can use header_format, body_text, etc.
 * If a row exists for (name, language), updates it. Otherwise inserts (for templates that exist only on Meta).
 */
export async function upsertTemplateFromMeta(
  meta: MetaTemplateDetailInput,
  userId: string
): Promise<WhatsAppTemplateRow> {
  const supabase = createServiceClient()
  const name = sanitizeTemplateName(meta.name)
  const language = (meta.language || 'en').replace(/-/g, '_').trim().slice(0, 10)
  const status = metaStatusToLocal(meta.status)
  const category = metaCategoryToLocal(meta.category)
  const buttons: TemplateButton[] = (meta.buttons || []).map((b) => ({
    type: (b.type === 'URL' || b.type === 'PHONE_NUMBER' || b.type === 'COPY_CODE' ? b.type : 'QUICK_REPLY') as TemplateButton['type'],
    text: b.text ?? '',
    example: b.example,
  }))

  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('id, header_media_url')
    .eq('name', name)
    .eq('language', language)
    .maybeSingle()

  const now = new Date().toISOString()
  if (existing) {
    const row = existing as { id: string; header_media_url: string | null }
    const { data: updated, error } = await supabase
      .from('whatsapp_templates')
      .update({
        body_text: meta.body_text || '',
        header_text: meta.header_text ?? null,
        footer_text: meta.footer_text ?? null,
        header_format: meta.header_format ?? 'TEXT',
        buttons: buttons.length > 0 ? buttons : [],
        status,
        meta_id: meta.id,
        updated_at: now,
      } as never)
      .eq('id', row.id)
      .select()
      .single()
    if (error) {
      if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
      throw new Error(error.message)
    }
    return updated as WhatsAppTemplateRow
  }

  const { data: inserted, error } = await supabase
    .from('whatsapp_templates')
    .insert({
      name,
      language,
      category,
      body_text: meta.body_text || '',
      header_text: meta.header_text ?? null,
      footer_text: meta.footer_text ?? null,
      header_format: meta.header_format ?? 'TEXT',
      header_media_url: null,
      header_media_id: null,
      buttons: buttons.length > 0 ? buttons : [],
      status,
      meta_id: meta.id,
      created_by: userId,
      updated_at: now,
    } as never)
    .select()
    .single()
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
  return inserted as WhatsAppTemplateRow
}

/** Delete a template by id. Only removes from DB; call Meta delete separately if meta_id is set. */
export async function deleteTemplate(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id)
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
}

/** Update a draft template. Fails if template is not in draft status. */
export async function updateTemplate(id: string, input: CreateTemplateInput): Promise<WhatsAppTemplateRow> {
  const existing = await getTemplateById(id)
  if (!existing) throw new Error('Template not found')
  if (existing.status !== 'draft') throw new Error('Only draft templates can be edited')

  const supabase = createServiceClient()
  const name = sanitizeTemplateName(input.name)
  const language = (input.language || 'en').replace(/-/g, '_').slice(0, 10)
  const row = {
    name,
    language,
    category: input.category,
    sub_category: input.sub_category ?? null,
    body_text: input.body_text,
    header_text: input.header_text || null,
    footer_text: input.footer_text || null,
    header_format: input.header_format ?? 'TEXT',
    header_media_url: input.header_media_url ?? null,
    header_media_id: input.header_media_id ?? null,
    buttons: input.buttons && input.buttons.length > 0 ? input.buttons : [],
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .update(row as never)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
  return data as WhatsAppTemplateRow
}
