/** Shared types for marketing (Bulk WhatsApp, Chat, Templates). */

export interface LeadRecipient {
  id: string
  name: string
  phone: string
  type: 'lead'
}

export interface CustomerRecipient {
  id: string
  name: string
  phone: string
  type: 'customer'
}

export interface PastedRecipient {
  id: string
  phone: string
  name: string
  type: 'pasted'
}

export type Recipient = LeadRecipient | CustomerRecipient | PastedRecipient

export interface SendResult {
  sent: number
  failed: number
  results: Array<{ phone: string; success: boolean; error?: string; metaResponse?: unknown }>
  /** Set when user scheduled instead of send now */
  scheduled?: boolean
  scheduledAt?: string
  scheduleMessage?: string
  scheduleError?: string
}

export interface TemplateForOverview {
  id: string
  name: string
  language: string
  status: string
  category?: string
}

export interface WhatsAppTemplate {
  id: string
  name: string
  language: string
  category: string
  sub_category?: string | null
  body_text: string
  header_text: string | null
  footer_text: string | null
  header_format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_media_url?: string | null
  header_media_id?: string | null
  buttons?: Array<{ type: string; text: string; example?: string }> | null
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  meta_id: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export interface LibraryTemplate {
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

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface ChatMessage {
  id: string
  lead_id: string | null
  phone: string
  conversation_key?: string
  direction: 'out' | 'in'
  body: string
  message_type?: 'text' | 'image' | 'video' | 'document'
  attachment_url?: string | null
  attachment_mime_type?: string | null
  attachment_file_name?: string | null
  attachment_size_bytes?: number | null
  thumbnail_url?: string | null
  assigned_to?: string | null
  is_read?: boolean
  read_at?: string | null
  meta_message_id: string | null
  /** Parent wamid when this message is a reply (incoming from webhook or outgoing saved from inbox). */
  reply_to_meta_message_id?: string | null
  /** Meta context.from — who sent the quoted message (incoming replies). */
  reply_context_from?: string | null
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
  last_message: ChatMessage
}

export type MetaTemplateOption = {
  name: string
  language: string
  category?: string
  body_text?: string
  header_text?: string | null
}
