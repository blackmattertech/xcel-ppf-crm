/**
 * WhatsApp chat messages: store and list conversation history.
 * Outgoing saved when sending from CRM; incoming from webhook.
 */

import { createServiceClient } from '@/lib/supabase/service'
import type { WhatsAppConfig } from '@/backend/services/whatsapp.service'
import { markMessageAsRead } from '@/backend/services/whatsapp.service'

export type MessageDirection = 'out' | 'in'

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface WhatsAppMessageRow {
  id: string
  lead_id: string | null
  phone: string
  direction: MessageDirection
  body: string
  message_type?: 'text' | 'image' | 'video' | 'document'
  attachment_url?: string | null
  attachment_mime_type?: string | null
  attachment_file_name?: string | null
  attachment_size_bytes?: number | null
  thumbnail_url?: string | null
  conversation_key?: string | null
  assigned_to?: string | null
  is_read?: boolean
  read_at?: string | null
  meta_message_id: string | null
  status: MessageStatus | null
  created_at: string
  updated_at?: string | null
}

/** Fingerprint for inbox list conditional GET (ETag). Null if RPC missing (migration not applied). */
export async function getWhatsappInboxRevision(): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('whatsapp_inbox_revision')
    if (error || data == null) return null
    return String(data)
  } catch {
    return null
  }
}

/** Fingerprint for a single thread (messages list) — includes delivery status / read updates via updated_at. */
export async function getWhatsappThreadRevision(params: {
  conversationKey?: string | null
  leadId?: string | null
  phone?: string | null
}): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    if (params.conversationKey) {
      const key = toConversationKey(params.conversationKey)
      // DB migration 043 — RPC not in generated Database types yet
      const { data, error } = await supabase.rpc('whatsapp_thread_revision' as never, {
        p_conversation_key: key,
        p_lead_id: null,
        p_phone: null,
      } as never)
      if (error || data == null) return null
      return String(data)
    }
    const normalizedPhone = params.phone ? normalizePhoneForStorage(params.phone) : null
    const leadUuid =
      params.leadId && /^[0-9a-f-]{36}$/i.test(params.leadId) ? params.leadId : null
    const { data, error } = await supabase.rpc('whatsapp_thread_revision' as never, {
      p_conversation_key: null,
      p_lead_id: leadUuid,
      p_phone: normalizedPhone,
    } as never)
    if (error || data == null) return null
    return String(data)
  } catch {
    return null
  }
}

export interface InboxMessageDTO {
  id: string
  lead_id: string | null
  phone: string
  conversation_key: string
  direction: MessageDirection
  body: string
  message_type: 'text' | 'image' | 'video' | 'document'
  attachment_url: string | null
  attachment_mime_type: string | null
  attachment_file_name: string | null
  attachment_size_bytes: number | null
  thumbnail_url: string | null
  assigned_to: string | null
  is_read: boolean
  read_at: string | null
  meta_message_id: string | null
  status: MessageStatus | null
  created_at: string
}

export interface ConversationSummary {
  conversation_key: string
  phone: string
  lead_id: string | null
  lead_name: string | null
  assigned_to: string | null
  unread_count: number
  last_message: InboxMessageDTO
}

/** Normalize phone to digits (E.164-ish) for matching. */
export function normalizePhoneForStorage(phone: string, defaultCountryCode = '91'): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 10) return defaultCountryCode + digits.slice(-10)
  return digits
}

function toConversationKey(phone: string): string {
  return normalizePhoneForStorage(phone)
}

export function toInboxMessageDTO(row: WhatsAppMessageRow): InboxMessageDTO {
  return {
    id: row.id,
    lead_id: row.lead_id,
    phone: row.phone,
    conversation_key: row.conversation_key ?? toConversationKey(row.phone),
    direction: row.direction,
    body: row.body,
    message_type: row.message_type ?? 'text',
    attachment_url: row.attachment_url ?? null,
    attachment_mime_type: row.attachment_mime_type ?? null,
    attachment_file_name: row.attachment_file_name ?? null,
    attachment_size_bytes: row.attachment_size_bytes ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    assigned_to: row.assigned_to ?? null,
    is_read: row.is_read ?? row.direction === 'out',
    read_at: row.read_at ?? null,
    meta_message_id: row.meta_message_id,
    status: row.status,
    created_at: row.created_at,
  }
}

export type SaveOutgoingResult =
  | { success: true; data: WhatsAppMessageRow }
  | { success: false; errorCode?: string; errorMessage?: string }

/** Insert outgoing message (after successful send). */
export async function saveOutgoingMessage(params: {
  leadId: string | null
  phone: string
  body: string
  metaMessageId?: string | null
  messageType?: 'text' | 'image' | 'video' | 'document'
  attachmentUrl?: string | null
  attachmentMimeType?: string | null
  attachmentFileName?: string | null
  attachmentSizeBytes?: number | null
  thumbnailUrl?: string | null
  assignedTo?: string | null
}): Promise<SaveOutgoingResult> {
  const supabase = createServiceClient()
  const phone = normalizePhoneForStorage(params.phone)
  const logError = (err: { code?: string; message?: string; details?: unknown } | null) => {
    if (!err) return
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] ?? 'unknown'
    console.error('[whatsapp-chat] saveOutgoingMessage FAILED:', {
      code: err.code,
      message: err.message,
      details: err.details,
      project: projectRef,
    })
  }

  const tryInsert = async (leadId: string | null) => {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .insert({
        lead_id: leadId,
        phone,
        conversation_key: toConversationKey(phone),
        direction: 'out',
        body: params.body,
        message_type: params.messageType ?? 'text',
        attachment_url: params.attachmentUrl ?? null,
        attachment_mime_type: params.attachmentMimeType ?? null,
        attachment_file_name: params.attachmentFileName ?? null,
        attachment_size_bytes: params.attachmentSizeBytes ?? null,
        thumbnail_url: params.thumbnailUrl ?? null,
        assigned_to: params.assignedTo ?? null,
        is_read: true,
        read_at: new Date().toISOString(),
        meta_message_id: params.metaMessageId?.trim() || null,
      } as never)
      .select()
      .single()
    return { data, error }
  }

  const { data, error } = await tryInsert(params.leadId || null)
  if (!error && data) return { success: true, data: data as WhatsAppMessageRow }

  // 23503 = foreign key violation (lead_id doesn't exist in leads). Retry without lead_id to save by phone.
  if (error?.code === '23503' && params.leadId) {
    const retry = await tryInsert(null)
    if (!retry.error && retry.data) return { success: true, data: retry.data as WhatsAppMessageRow }
    if (retry.error) logError(retry.error)
    return { success: false, errorCode: retry.error?.code, errorMessage: retry.error?.message }
  }

  if (error) logError(error)
  return { success: false, errorCode: error?.code, errorMessage: error?.message }
}

/** Bulk insert outgoing rows (one DB round-trip). For broadcast sends with lead_id null. */
export async function saveOutgoingMessagesBatch(
  rows: Array<{
    leadId: string | null
    phone: string
    body: string
    metaMessageId?: string | null
  }>
): Promise<void> {
  if (rows.length === 0) return
  const supabase = createServiceClient()
  const payload = rows.map((r) => ({
    lead_id: r.leadId || null,
    phone: normalizePhoneForStorage(r.phone),
    direction: 'out' as const,
    body: r.body,
    meta_message_id: r.metaMessageId?.trim() || null,
  }))
  const { error } = await supabase.from('whatsapp_messages').insert(payload as never)
  if (error) {
    console.error('[whatsapp-chat] saveOutgoingMessagesBatch FAILED:', error.message)
  }
}

/** Insert incoming message (from webhook). */
export async function saveIncomingMessage(params: {
  phone: string
  body: string
  metaMessageId?: string | null
  leadId?: string | null
  messageType?: 'text' | 'image' | 'video' | 'document'
  attachmentUrl?: string | null
  attachmentMimeType?: string | null
  attachmentFileName?: string | null
  attachmentSizeBytes?: number | null
  thumbnailUrl?: string | null
}): Promise<WhatsAppMessageRow | null> {
  const supabase = createServiceClient()
  const phone = normalizePhoneForStorage(params.phone)
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert({
      lead_id: params.leadId || null,
      phone,
      conversation_key: toConversationKey(phone),
      direction: 'in',
      body: params.body,
      message_type: params.messageType ?? 'text',
      attachment_url: params.attachmentUrl ?? null,
      attachment_mime_type: params.attachmentMimeType ?? null,
      attachment_file_name: params.attachmentFileName ?? null,
      attachment_size_bytes: params.attachmentSizeBytes ?? null,
      thumbnail_url: params.thumbnailUrl ?? null,
      is_read: false,
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

export async function listMessagesByConversationKey(conversationKey: string): Promise<InboxMessageDTO[]> {
  const normalized = toConversationKey(conversationKey)
  if (!normalized || normalized.length < 10) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_key', normalized)
    .order('created_at', { ascending: true })
  if (error) {
    if (error.code === '42P01' || error.code === '42703') return []
    console.error('[whatsapp-chat] listMessagesByConversationKey:', error)
    return []
  }
  return ((data ?? []) as WhatsAppMessageRow[]).map(toInboxMessageDTO)
}

export async function listConversations(params?: {
  search?: string
  assignedTo?: string
  unreadOnly?: boolean
  limit?: number
}): Promise<ConversationSummary[]> {
  const supabase = createServiceClient()
  const limit = Math.min(Math.max(params?.limit ?? 100, 1), 200)
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) {
    if (error.code === '42P01') return []
    console.error('[whatsapp-chat] listConversations:', error)
    return []
  }
  const rows = (data ?? []) as WhatsAppMessageRow[]
  const byKey = new Map<string, WhatsAppMessageRow[]>()
  for (const row of rows) {
    const key = row.conversation_key ?? toConversationKey(row.phone)
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }
  const summaries: ConversationSummary[] = []
  for (const [key, items] of byKey) {
    const sorted = [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const last = sorted[sorted.length - 1]
    if (!last) continue
    const unreadCount = sorted.filter((m) => m.direction === 'in' && !(m.is_read ?? false)).length
    summaries.push({
      conversation_key: key,
      phone: last.phone,
      lead_id: last.lead_id,
      lead_name: null,
      assigned_to: last.assigned_to ?? null,
      unread_count: unreadCount,
      last_message: toInboxMessageDTO(last),
    })
  }
  let filtered = summaries
  if (params?.assignedTo) filtered = filtered.filter((c) => c.assigned_to === params.assignedTo)
  if (params?.unreadOnly) filtered = filtered.filter((c) => c.unread_count > 0)
  if (params?.search?.trim()) {
    const q = params.search.trim().toLowerCase()
    filtered = filtered.filter(
      (c) =>
        c.phone.includes(q) ||
        (c.last_message.body || '').toLowerCase().includes(q) ||
        (c.lead_name || '').toLowerCase().includes(q)
    )
  }
  filtered.sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime())
  return filtered.slice(0, limit)
}

/**
 * Mark inbound rows read in the DB; optionally notify Meta so the customer's WhatsApp shows read (blue ticks).
 * Meta: POST /{phone_number_id}/messages with { messaging_product, status: "read", message_id } — marks that
 * message and earlier ones in the thread as read on the user's device.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-messages-as-read
 */
export async function markConversationRead(
  conversationKey: string,
  whatsappConfig?: WhatsAppConfig | null
): Promise<void> {
  const normalized = toConversationKey(conversationKey)
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('whatsapp_messages')
    .update({ is_read: true, read_at: new Date().toISOString() } as never)
    .eq('conversation_key', normalized)
    .eq('direction', 'in')
    .eq('is_read', false)
  if (error && error.code !== '42P01' && error.code !== '42703') {
    console.error('[whatsapp-chat] markConversationRead:', error)
  }

  if (!whatsappConfig?.phoneNumberId || !whatsappConfig?.accessToken) return

  const { data: latestInbound } = await supabase
    .from('whatsapp_messages')
    .select('meta_message_id')
    .eq('conversation_key', normalized)
    .eq('direction', 'in')
    .not('meta_message_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const wamid = (latestInbound as { meta_message_id?: string | null } | null)?.meta_message_id?.trim()
  if (!wamid) return

  const result = await markMessageAsRead(wamid, whatsappConfig)
  if (!result.success && result.error) {
    console.warn('[whatsapp-chat] Meta mark-as-read failed (CRM DB still updated):', result.error)
  }
}

export async function assignConversation(conversationKey: string, userId: string | null): Promise<void> {
  const normalized = toConversationKey(conversationKey)
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('whatsapp_messages')
    .update({ assigned_to: userId } as never)
    .eq('conversation_key', normalized)
  if (error && error.code !== '42P01' && error.code !== '42703') {
    console.error('[whatsapp-chat] assignConversation:', error)
  }
}

const STATUS_ORDER: Record<Exclude<MessageStatus, 'failed'>, number> = { sent: 1, delivered: 2, read: 3 }

/** Update message status by meta_message_id (from webhook statuses). Upgrades to higher status; 'failed' always sets. */
export async function updateMessageStatus(
  metaMessageId: string,
  newStatus: MessageStatus
): Promise<void> {
  const wamid = metaMessageId?.trim()
  if (!wamid) return
  try {
    const supabase = createServiceClient()
    const { data: raw, error: fetchErr } = await supabase
      .from('whatsapp_messages')
      .select('id, status')
      .eq('meta_message_id', wamid)
      .eq('direction', 'out')
      .limit(1)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    const existing = raw as { id: string; status?: string | null } | null
    if (!existing?.id) {
      if (newStatus === 'read') {
        console.warn('[whatsapp-chat] updateMessageStatus: no outgoing row for wamid (read event ignored)', {
          wamidPreview: wamid.slice(0, 24),
        })
      }
      return
    }
    if (newStatus === 'failed') {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ status: 'failed' } as never)
        .eq('id', existing.id)
      if (error) throw error
      return
    }
    const currentRaw = (existing.status as string | null) ?? 'sent'
    const current = (currentRaw.toLowerCase() as MessageStatus) || 'sent'
    const curOrder = STATUS_ORDER[current as keyof typeof STATUS_ORDER]
    const nextOrder = STATUS_ORDER[newStatus as keyof typeof STATUS_ORDER]
    if (curOrder != null && nextOrder != null && nextOrder <= curOrder) return
    const { error } = await supabase
      .from('whatsapp_messages')
      .update({ status: newStatus } as never)
      .eq('id', existing.id)
    if (error) throw error
  } catch (err) {
    // Ignore if status column doesn't exist (migration 022 not run)
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '42703') return
    throw err
  }
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
