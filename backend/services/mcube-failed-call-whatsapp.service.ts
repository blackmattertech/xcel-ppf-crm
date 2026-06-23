/**
 * When admin enables MCube failed-call WhatsApp in settings, send a configured message
 * after outbound MCube hangup with outcome not_reachable (no answer, busy, cancel, etc.).
 */

import { createServiceClient } from '@/lib/supabase/service'
import type { CallOutcome } from '@/shared/constants/lead-status'
import type { AutomationMessageType } from '@/shared/whatsapp-automation-types'
import { mapDialStatusToOutcome } from '@/backend/services/mcube.service'
import { getLeadVehicleName } from '@/shared/utils/lead-meta'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import {
  BroadcastValidationError,
  resolveBroadcastPayload,
} from '@/backend/services/whatsapp-broadcast-resolve'
import {
  sendTemplateMessage,
  sendWhatsAppMedia,
  sendWhatsAppText,
} from '@/backend/services/whatsapp.service'
import { getTemplateById } from '@/backend/services/whatsapp-template.service'
import { saveOutgoingMessage } from '@/backend/services/whatsapp-chat.service'

export type McubeFailedCallMessageType = AutomationMessageType

export interface McubeFailedCallWhatsAppSettings {
  enabled: boolean
  messageType: McubeFailedCallMessageType
  templateId: string | null
  bodyParameters: string[]
  headerParameters: string[]
  messageBody: string | null
  mediaUrl: string | null
  mediaMimeType: string | null
  mediaFileName: string | null
  mediaMetaId: string | null
}

export interface MaybeSendFailedCallWhatsAppParams {
  leadId: string
  callId: string
  mcubeCallId: string
  outcome: CallOutcome
  dialStatus: string | null
  sessionId: string | null
  direction: 'inbound' | 'outbound' | null
  skipBecauseManualMerge?: boolean
}

function parseStringArrayJson(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function parseMessageType(value: unknown): McubeFailedCallMessageType {
  if (value === 'text' || value === 'image' || value === 'video') return value
  return 'template'
}

export function applyLeadNameToText(text: string, leadName: string | null): string {
  return applyLeadTokens(text, { name: leadName, car: null })
}

export function applyLeadTokens(
  text: string,
  tokens: { name: string | null; car: string | null }
): string {
  const name = tokens.name?.trim() || 'there'
  const car = tokens.car?.trim() || 'vehicle'
  return text
    .replace(/\{\{lead_name\}\}/gi, name)
    .replace(/\{\{name\}\}/gi, name)
    .replace(/\{\{lead_car\}\}/gi, car)
    .replace(/\{\{car\}\}/gi, car)
}

function applyLeadNameToken(params: string[], leadName: string | null, leadCar: string | null): string[] {
  return params.map((p) => applyLeadTokens(p, { name: leadName, car: leadCar }))
}

export function validateMcubeFailedCallWhatsAppConfig(
  settings: Pick<
    McubeFailedCallWhatsAppSettings,
    'messageType' | 'templateId' | 'messageBody' | 'mediaUrl'
  >
): string | null {
  switch (settings.messageType) {
    case 'template':
      if (!settings.templateId) return 'Select an approved WhatsApp template'
      return null
    case 'text':
      if (!settings.messageBody?.trim()) return 'Enter a text message (use {{lead_name}} for the lead name)'
      return null
    case 'image':
    case 'video':
      if (!settings.mediaUrl?.trim()) return `Upload a ${settings.messageType} file before enabling`
      return null
    default:
      return 'Invalid message type'
  }
}

export async function getMcubeFailedCallWhatsAppSettings(): Promise<McubeFailedCallWhatsAppSettings> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('mcube_settings')
    .select(
      `
      failed_call_whatsapp_enabled,
      failed_call_whatsapp_message_type,
      failed_call_whatsapp_template_id,
      failed_call_whatsapp_body_parameters,
      failed_call_whatsapp_header_parameters,
      failed_call_whatsapp_message_body,
      failed_call_whatsapp_media_url,
      failed_call_whatsapp_media_mime_type,
      failed_call_whatsapp_media_file_name,
      failed_call_whatsapp_media_meta_id
    `
    )
    .eq('id', true)
    .maybeSingle()

  if (error) throw new Error(`Failed to load MCube WhatsApp settings: ${error.message}`)

  const row = data as {
    failed_call_whatsapp_enabled?: boolean
    failed_call_whatsapp_message_type?: string
    failed_call_whatsapp_template_id?: string | null
    failed_call_whatsapp_body_parameters?: unknown
    failed_call_whatsapp_header_parameters?: unknown
    failed_call_whatsapp_message_body?: string | null
    failed_call_whatsapp_media_url?: string | null
    failed_call_whatsapp_media_mime_type?: string | null
    failed_call_whatsapp_media_file_name?: string | null
    failed_call_whatsapp_media_meta_id?: string | null
  } | null

  return {
    enabled: Boolean(row?.failed_call_whatsapp_enabled),
    messageType: parseMessageType(row?.failed_call_whatsapp_message_type),
    templateId: row?.failed_call_whatsapp_template_id ?? null,
    bodyParameters: parseStringArrayJson(row?.failed_call_whatsapp_body_parameters),
    headerParameters: parseStringArrayJson(row?.failed_call_whatsapp_header_parameters),
    messageBody: row?.failed_call_whatsapp_message_body ?? null,
    mediaUrl: row?.failed_call_whatsapp_media_url ?? null,
    mediaMimeType: row?.failed_call_whatsapp_media_mime_type ?? null,
    mediaFileName: row?.failed_call_whatsapp_media_file_name ?? null,
    mediaMetaId: row?.failed_call_whatsapp_media_meta_id ?? null,
  }
}

export function shouldSendFailedCallWhatsApp(params: {
  outcome: CallOutcome
  dialStatus: string | null
  sessionId: string | null
  direction: 'inbound' | 'outbound' | null
  skipBecauseManualMerge?: boolean
}): boolean {
  if (params.skipBecauseManualMerge) return false
  if (params.outcome !== 'not_reachable') return false
  if (params.direction === 'inbound') return false
  if (!params.sessionId && params.direction !== 'outbound') return false
  if (mapDialStatusToOutcome(params.dialStatus) !== 'not_reachable') return false
  return true
}

type SendResult = { success: boolean; messageId?: string; error?: string }

async function sendConfiguredMessage(params: {
  settings: McubeFailedCallWhatsAppSettings
  phone: string
  leadName: string | null
  leadCar: string
  config: NonNullable<Awaited<ReturnType<typeof getResolvedWhatsAppConfig>>['config']>
  wabaConfig: NonNullable<Awaited<ReturnType<typeof getResolvedWhatsAppConfig>>['wabaConfig']>
}): Promise<{
  result: SendResult
  chatBody: string
  templateName?: string
  metaTemplateId?: string | null
  messageType: McubeFailedCallMessageType
  attachmentUrl?: string
}> {
  const { settings, phone, leadName, leadCar, config, wabaConfig } = params
  const messageType = settings.messageType

  if (messageType === 'template') {
    if (!settings.templateId) {
      return { result: { success: false, error: 'No template configured' }, chatBody: '', messageType }
    }

    const bodyParameters = applyLeadNameToken(settings.bodyParameters, leadName, leadCar)
    const headerParameters =
      settings.headerParameters.length > 0
        ? applyLeadNameToken(settings.headerParameters, leadName, leadCar)
        : undefined

    let payload
    try {
      payload = await resolveBroadcastPayload(
        {
          templateId: settings.templateId,
          recipients: [{ phone, name: leadName ?? undefined }],
          bodyParameters,
          headerParameters,
          defaultCountryCode: '91',
        },
        wabaConfig
      )
    } catch (err) {
      const message =
        err instanceof BroadcastValidationError
          ? String(err.body.error ?? err.message)
          : err instanceof Error
            ? err.message
            : 'Template validation failed'
      return { result: { success: false, error: message }, chatBody: '', messageType }
    }

    const recipient = payload.recipients[0]
    const result = await sendTemplateMessage(phone, payload.templateName, payload.templateLanguage, {
      bodyParameters: recipient?.bodyParameters,
      headerParameters: payload.headerParameters,
      headerFormat: payload.headerFormat,
      headerMediaId: payload.headerMediaId ?? undefined,
      defaultCountryCode: payload.defaultCountryCode,
      config,
    })

    const templateRow = await getTemplateById(settings.templateId)
    return {
      result,
      chatBody: `[MCube failed call · Template: ${payload.templateName}]`,
      templateName: payload.templateName,
      metaTemplateId: templateRow?.meta_id ?? null,
      messageType,
    }
  }

  if (messageType === 'text') {
    const body = applyLeadTokens(settings.messageBody?.trim() || '', { name: leadName, car: leadCar })
    if (!body) {
      return { result: { success: false, error: 'Text message is empty' }, chatBody: '', messageType }
    }
    const result = await sendWhatsAppText(phone, body, config, null, '91')
    return { result, chatBody: body, messageType }
  }

  const mediaUrl = settings.mediaUrl?.trim()
  if (!mediaUrl) {
    return { result: { success: false, error: 'Media URL missing' }, chatBody: '', messageType }
  }

  const caption = settings.messageBody?.trim()
    ? applyLeadTokens(settings.messageBody, { name: leadName, car: leadCar })
    : undefined

  const result = await sendWhatsAppMedia(
    phone,
    {
      mediaType: messageType === 'video' ? 'video' : 'image',
      mediaUrl,
      fileName: settings.mediaFileName ?? undefined,
      caption,
      defaultCountryCode: '91',
    },
    config
  )

  const chatBody = caption || `[${messageType === 'video' ? 'Video' : 'Image'} · MCube failed call]`
  return {
    result,
    chatBody,
    messageType,
    attachmentUrl: mediaUrl,
  }
}

export async function maybeSendFailedCallWhatsAppTemplate(
  params: MaybeSendFailedCallWhatsAppParams
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  if (!shouldSendFailedCallWhatsApp(params)) {
    return { sent: false, skipped: 'conditions_not_met' }
  }

  const settings = await getMcubeFailedCallWhatsAppSettings()
  if (!settings.enabled) return { sent: false, skipped: 'disabled' }

  const configError = validateMcubeFailedCallWhatsAppConfig(settings)
  if (configError) return { sent: false, skipped: 'not_configured', error: configError }

  const supabase = createServiceClient()

  const { data: existingLog } = await supabase
    .from('mcube_failed_call_whatsapp_log')
    .select('id')
    .eq('mcube_call_id', params.mcubeCallId)
    .maybeSingle()
  if (existingLog) return { sent: false, skipped: 'already_sent' }

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, name, meta_data, requirement')
    .eq('id', params.leadId)
    .maybeSingle()
  if (leadErr) throw new Error(leadErr.message)
  if (!lead) return { sent: false, skipped: 'lead_not_found' }

  const phone = (lead as { phone: string }).phone?.trim()
  const leadName = (lead as { name?: string | null }).name ?? null
  const leadCar = getLeadVehicleName(
    lead as { meta_data?: Record<string, unknown> | null; requirement?: string | null }
  )

  if (!phone) {
    await recordFailedCallWhatsAppLog({
      callId: params.callId,
      mcubeCallId: params.mcubeCallId,
      leadId: params.leadId,
      templateId: settings.templateId,
      messageType: settings.messageType,
      dialStatus: params.dialStatus,
      status: 'failed',
      error: 'Lead has no phone number',
    })
    return { sent: false, error: 'Lead has no phone number' }
  }

  const { config, wabaConfig } = await getResolvedWhatsAppConfig()
  if (!config || !wabaConfig) {
    await recordFailedCallWhatsAppLog({
      callId: params.callId,
      mcubeCallId: params.mcubeCallId,
      leadId: params.leadId,
      templateId: settings.templateId,
      messageType: settings.messageType,
      dialStatus: params.dialStatus,
      status: 'failed',
      error: 'WhatsApp API not configured',
    })
    return { sent: false, error: 'WhatsApp API not configured' }
  }

  const sent = await sendConfiguredMessage({
    settings,
    phone,
    leadName,
    leadCar,
    config,
    wabaConfig,
  })

  if (!sent.result.success) {
    await recordFailedCallWhatsAppLog({
      callId: params.callId,
      mcubeCallId: params.mcubeCallId,
      leadId: params.leadId,
      templateId: settings.templateId,
      messageType: settings.messageType,
      dialStatus: params.dialStatus,
      status: 'failed',
      error: sent.result.error ?? 'Send failed',
    })
    return { sent: false, error: sent.result.error ?? 'Send failed' }
  }

  await saveOutgoingMessage({
    leadId: params.leadId,
    phone,
    body: sent.chatBody,
    metaMessageId: sent.result.messageId ?? undefined,
    templateName: sent.templateName ?? null,
    metaTemplateId: sent.metaTemplateId ?? null,
    messageType:
      sent.messageType === 'image' || sent.messageType === 'video'
        ? sent.messageType
        : sent.messageType === 'text'
          ? 'text'
          : undefined,
    attachmentUrl: sent.attachmentUrl ?? null,
    attachmentMimeType: settings.mediaMimeType,
    attachmentFileName: settings.mediaFileName,
  })

  await recordFailedCallWhatsAppLog({
    callId: params.callId,
    mcubeCallId: params.mcubeCallId,
    leadId: params.leadId,
    templateId: settings.templateId,
    messageType: settings.messageType,
    dialStatus: params.dialStatus,
    status: 'sent',
    wamid: sent.result.messageId ?? null,
  })

  return { sent: true }
}

async function recordFailedCallWhatsAppLog(row: {
  callId: string
  mcubeCallId: string
  leadId: string
  templateId: string | null
  messageType: McubeFailedCallMessageType
  dialStatus: string | null
  status: 'sent' | 'failed'
  wamid?: string | null
  error?: string | null
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('mcube_failed_call_whatsapp_log').upsert(
    {
      call_id: row.callId,
      mcube_call_id: row.mcubeCallId,
      lead_id: row.leadId,
      template_id: row.templateId,
      message_type: row.messageType,
      dial_status: row.dialStatus,
      status: row.status,
      wamid: row.wamid ?? null,
      error: row.error ?? null,
    } as never,
    { onConflict: 'mcube_call_id', ignoreDuplicates: true }
  )
  if (error) {
    console.error('[mcube-failed-call-whatsapp] log insert failed', error.message)
  }
}
