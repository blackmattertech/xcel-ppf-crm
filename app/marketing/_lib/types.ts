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
  body_text: string
  header_text: string | null
  footer_text: string | null
  header_format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_media_url?: string | null
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

export interface ChatMessage {
  id: string
  lead_id: string | null
  phone: string
  direction: 'out' | 'in'
  body: string
  meta_message_id: string | null
  created_at: string
}

export type MetaTemplateOption = {
  name: string
  language: string
  category?: string
  body_text?: string
  header_text?: string | null
}
