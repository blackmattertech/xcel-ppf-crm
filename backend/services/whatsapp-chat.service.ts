/**
 * WhatsApp chat messages: store and list conversation history.
 * Outgoing saved when sending from CRM; incoming from webhook.
 */

import { createServiceClient } from '@/lib/supabase/service'

export type MessageDirection = 'out' | 'in'

export interface WhatsAppMessageRow {
  id: string
  lead_id: string | null
  phone: string
  direction: MessageDirection
  body: string
  meta_message_id: string | null
  created_at: string
}

/** Normalize phone to digits (E.164-ish) for matching. */
export function normalizePhoneForStorage(phone: string, defaultCountryCode = '91'): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 10) return defaultCountryCode + digits.slice(-10)
  return digits
}

/** Insert outgoing message (after successful send). */
export async function saveOutgoingMessage(params: {
  leadId: string | null
  phone: string
  body: string
  metaMessageId?: string | null
}): Promise<WhatsAppMessageRow | null> {
  const supabase = createServiceClient()
  const phone = normalizePhoneForStorage(params.phone)
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert({
      lead_id: params.leadId || null,
      phone,
      direction: 'out',
      body: params.body,
      meta_message_id: params.metaMessageId || null,
    } as never)
    .select()
    .single()
  if (error) {
    if (error.code === '42P01') return null // table missing
    console.error('[whatsapp-chat] saveOutgoingMessage:', error)
    return null
  }
  return data as WhatsAppMessageRow
}

/** Insert incoming message (from webhook). */
export async function saveIncomingMessage(params: {
  phone: string
  body: string
  metaMessageId?: string | null
  leadId?: string | null
}): Promise<WhatsAppMessageRow | null> {
  const supabase = createServiceClient()
  const phone = normalizePhoneForStorage(params.phone)
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert({
      lead_id: params.leadId || null,
      phone,
      direction: 'in',
      body: params.body,
      meta_message_id: params.metaMessageId || null,
    } as never)
    .select()
    .single()
  if (error) {
    if (error.code === '42P01') return null
    console.error('[whatsapp-chat] saveIncomingMessage:', error)
    return null
  }
  return data as WhatsAppMessageRow
}

/** List messages for a conversation (by lead_id or phone), oldest first. */
export async function listMessagesByLeadId(leadId: string): Promise<WhatsAppMessageRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
  if (error) {
    if (error.code === '42P01') return []
    console.error('[whatsapp-chat] listMessagesByLeadId:', error)
    return []
  }
  return (data ?? []) as WhatsAppMessageRow[]
}

/** List messages by phone (normalized). Use when lead_id is unknown. */
export async function listMessagesByPhone(phone: string): Promise<WhatsAppMessageRow[]> {
  const normalized = normalizePhoneForStorage(phone)
  // Avoid querying with useless values: empty/minimal input becomes "91" and would match nothing or wrong rows
  if (!normalized || normalized.length < 10) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('phone', normalized)
    .order('created_at', { ascending: true })
  if (error) {
    if (error.code === '42P01') return []
    console.error('[whatsapp-chat] listMessagesByPhone:', error)
    return []
  }
  return (data ?? []) as WhatsAppMessageRow[]
}

/** Get full conversation: merge messages by lead_id and by phone, dedupe, sort by time. */
export async function getConversation(leadId: string | null, phone: string): Promise<WhatsAppMessageRow[]> {
  const normalizedPhone = normalizePhoneForStorage(phone)
  const hasValidPhone = normalizedPhone.length >= 10
  const [byLead, byPhone] = await Promise.all([
    leadId ? listMessagesByLeadId(leadId) : Promise.resolve([]),
    hasValidPhone ? listMessagesByPhone(phone) : Promise.resolve([]),
  ])
  const seen = new Set<string>()
  const merged: WhatsAppMessageRow[] = []
  for (const m of [...byLead, ...byPhone]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    merged.push(m)
  }
  merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return merged
}
