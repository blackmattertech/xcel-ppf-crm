/**
 * WhatsApp message templates: DB storage, submit to Meta, sync status.
 * Use with whatsapp.service for Meta API (create/list templates, send template message).
 */

import { createServiceClient } from '@/lib/supabase/service'

export type TemplateStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

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
  body_text: string
  header_text: string | null
  footer_text: string | null
  header_format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_media_url: string | null
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
  body_text: string
  header_text?: string | null
  footer_text?: string | null
  header_format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_media_url?: string | null
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
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .insert({
      name,
      language,
      category: input.category,
      body_text: input.body_text,
      header_text: input.header_text || null,
      footer_text: input.footer_text || null,
      header_format: input.header_format || 'TEXT',
      header_media_url: input.header_media_url || null,
      buttons: input.buttons && input.buttons.length > 0 ? input.buttons : [],
      status: 'draft',
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
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

export async function listTemplates(filters?: { status?: TemplateStatus }): Promise<WhatsAppTemplateRow[]> {
  const supabase = createServiceClient()
  let q = supabase.from('whatsapp_templates').select('*').order('updated_at', { ascending: false })
  if (filters?.status) q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) {
    if (isTableMissingError(error)) return []
    throw new Error(error.message)
  }
  return (data || []) as WhatsAppTemplateRow[]
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
    })
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
  const { error } = await supabase.from('whatsapp_templates').update(payload).eq('id', id)
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE)
    throw new Error(error.message)
  }
}
