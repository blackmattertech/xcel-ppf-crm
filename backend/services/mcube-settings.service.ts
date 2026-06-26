import { createServiceClient } from '@/lib/supabase/service'
import type { AutomationMessageType } from '@/shared/whatsapp-automation-types'

type McubeFailedCallMessageType = AutomationMessageType

export type McubeSettingsRow = {
  hide_connected_when_last_mcube_not_connected?: boolean
  failed_call_whatsapp_enabled?: boolean
  failed_call_whatsapp_require_caller_approval?: boolean
  failed_call_whatsapp_message_type?: string
  failed_call_whatsapp_template_id?: string | null
  failed_call_whatsapp_body_parameters?: unknown
  failed_call_whatsapp_header_parameters?: unknown
  failed_call_whatsapp_message_body?: string | null
  failed_call_whatsapp_media_url?: string | null
  failed_call_whatsapp_media_mime_type?: string | null
  failed_call_whatsapp_media_file_name?: string | null
  failed_call_whatsapp_media_meta_id?: string | null
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function parseMessageType(value: unknown): McubeFailedCallMessageType {
  if (value === 'text' || value === 'image' || value === 'video') return value
  return 'template'
}

export function mcubeSettingsColumnExists(
  row: McubeSettingsRow | null | undefined,
  column: keyof McubeSettingsRow
): boolean {
  if (!row) return true
  return column in row
}

export function toApiMcubeSettings(row: McubeSettingsRow | null | undefined) {
  const messageType = row?.failed_call_whatsapp_message_type
  return {
    hideConnectedWhenLastMcubeNotConnected:
      row?.hide_connected_when_last_mcube_not_connected ?? true,
    failedCallWhatsappEnabled: Boolean(row?.failed_call_whatsapp_enabled),
    failedCallWhatsappRequireCallerApproval:
      row?.failed_call_whatsapp_require_caller_approval !== false,
    failedCallWhatsappMessageType: parseMessageType(messageType),
    failedCallWhatsappTemplateId: row?.failed_call_whatsapp_template_id ?? null,
    failedCallWhatsappBodyParameters: parseStringArray(row?.failed_call_whatsapp_body_parameters),
    failedCallWhatsappHeaderParameters: parseStringArray(row?.failed_call_whatsapp_header_parameters),
    failedCallWhatsappMessageBody: row?.failed_call_whatsapp_message_body ?? null,
    failedCallWhatsappMediaUrl: row?.failed_call_whatsapp_media_url ?? null,
    failedCallWhatsappMediaMimeType: row?.failed_call_whatsapp_media_mime_type ?? null,
    failedCallWhatsappMediaFileName: row?.failed_call_whatsapp_media_file_name ?? null,
    failedCallWhatsappMediaMetaId: row?.failed_call_whatsapp_media_meta_id ?? null,
  }
}

/** Load settings with select('*') so missing migration columns do not break the API. */
export async function fetchMcubeSettingsRow(): Promise<McubeSettingsRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('mcube_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message)
  }

  return (data as McubeSettingsRow | null) ?? null
}

export function toFailedCallWhatsAppSettings(row: McubeSettingsRow | null | undefined) {
  return {
    enabled: Boolean(row?.failed_call_whatsapp_enabled),
    requireCallerApproval: row?.failed_call_whatsapp_require_caller_approval !== false,
    messageType: parseMessageType(row?.failed_call_whatsapp_message_type),
    templateId: row?.failed_call_whatsapp_template_id ?? null,
    bodyParameters: parseStringArray(row?.failed_call_whatsapp_body_parameters),
    headerParameters: parseStringArray(row?.failed_call_whatsapp_header_parameters),
    messageBody: row?.failed_call_whatsapp_message_body ?? null,
    mediaUrl: row?.failed_call_whatsapp_media_url ?? null,
    mediaMimeType: row?.failed_call_whatsapp_media_mime_type ?? null,
    mediaFileName: row?.failed_call_whatsapp_media_file_name ?? null,
    mediaMetaId: row?.failed_call_whatsapp_media_meta_id ?? null,
  }
}
