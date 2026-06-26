export type AutomationMessageType = 'template' | 'text' | 'image' | 'video'
export type AutomationEnrollmentStatus = 'active' | 'completed' | 'cancelled'
export type AutomationEnrollmentSource = 'direct' | 'bucket'
export type AutomationBatchStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type AutomationSendLogStatus = 'sent' | 'failed' | 'retrying'

/** Max concurrent active WhatsApp automation loops (enforced in app + DB trigger). */
export const MAX_ACTIVE_WHATSAPP_AUTOMATION_FLOWS = 3

export interface AutomationFlow {
  id: string
  name: string
  cycle_days: number
  restart_on_complete: boolean
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AutomationTrigger {
  id: string
  flow_id: string
  day_offset: number
  message_type: AutomationMessageType
  template_id: string | null
  body_parameters: string[] | null
  header_parameters: string[] | null
  message_body: string | null
  media_url: string | null
  media_mime_type: string | null
  media_file_name: string | null
  media_meta_id: string | null
  created_at: string
  updated_at: string
}

export interface AutomationFlowWithTriggers extends AutomationFlow {
  triggers: AutomationTrigger[]
}

export interface AutomationBucketLink {
  id: string
  flow_id: string
  bucket_id: string
  linked_by: string | null
  linked_at: string
  is_active: boolean
  flow?: Pick<AutomationFlow, 'id' | 'name' | 'cycle_days' | 'is_active'>
  bucket?: { id: string; name: string; color: string }
}

export interface AutomationEnrollment {
  id: string
  flow_id: string
  lead_id: string
  started_at: string
  cycle_number: number
  status: AutomationEnrollmentStatus
  source: AutomationEnrollmentSource
  bucket_link_id: string | null
  enrolled_by: string | null
  created_at: string
  updated_at: string
  flow?: Pick<AutomationFlow, 'id' | 'name' | 'cycle_days'>
}

export interface AutomationRecipient {
  enrollmentId: string
  leadId: string
  phone: string
  name?: string
  cycleNumber: number
}

export interface AutomationBatchPayload {
  messageType: AutomationMessageType
  templateName?: string
  templateLanguage?: string
  bodyParameters?: string[]
  headerParameters?: string[]
  headerFormat?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerMediaId?: string | null
  messageBody?: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaFileName?: string
  mediaMetaId?: string
  defaultCountryCode?: string
  recipients: AutomationRecipient[]
}

export interface AutomationBatchProgress {
  remainingRecipients: AutomationRecipient[]
  phoneAttempts: Record<string, number>
  sentTotal: number
  failedDeliveryCount: number
  givenUp: Array<{ phone: string; leadId?: string; lastError?: string }>
}

export interface CreateAutomationFlowInput {
  name: string
  cycle_days: number
  restart_on_complete?: boolean
  is_active?: boolean
  created_by: string
}

export interface UpdateAutomationFlowInput {
  name?: string
  cycle_days?: number
  restart_on_complete?: boolean
  is_active?: boolean
}

export interface UpsertAutomationTriggerInput {
  day_offset: number
  message_type: AutomationMessageType
  template_id?: string | null
  body_parameters?: string[] | null
  header_parameters?: string[] | null
  message_body?: string | null
  media_url?: string | null
  media_mime_type?: string | null
  media_file_name?: string | null
  media_meta_id?: string | null
}
