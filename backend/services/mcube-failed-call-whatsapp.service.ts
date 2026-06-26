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
import {
  fetchMcubeSettingsRow,
  toFailedCallWhatsAppSettings,
} from '@/backend/services/mcube-settings.service'

export type McubeFailedCallMessageType = AutomationMessageType

export interface McubeFailedCallWhatsAppSettings {
  enabled: boolean
  requireCallerApproval: boolean
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
  callerUserId: string | null
  outcome: CallOutcome
  dialStatus: string | null
  sessionId: string | null
  direction: 'inbound' | 'outbound' | null
  skipBecauseManualMerge?: boolean
}

export interface FailedCallWhatsAppPromptRow {
  id: string
  call_id: string | null
  mcube_call_id: string
  lead_id: string
  caller_user_id: string
  dial_status: string | null
  status: string
  message_preview: string | null
  error: string | null
  created_at: string
  lead?: { id: string; name: string; phone: string | null; lead_id?: string } | null
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
  const row = await fetchMcubeSettingsRow()
  return toFailedCallWhatsAppSettings(row)
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

export function buildFailedCallMessagePreview(
  settings: McubeFailedCallWhatsAppSettings,
  leadName: string | null,
  leadCar: string,
  templateName?: string | null
): string {
  switch (settings.messageType) {
    case 'template':
      return templateName
        ? `WhatsApp template: ${templateName}`
        : 'WhatsApp template message'
    case 'text':
      return applyLeadTokens(settings.messageBody?.trim() || DEFAULT_FAILED_CALL_TEXT, {
        name: leadName,
        car: leadCar,
      })
    case 'image':
    case 'video': {
      const caption = settings.messageBody?.trim()
        ? applyLeadTokens(settings.messageBody, { name: leadName, car: leadCar })
        : ''
      return caption
        ? `${settings.messageType === 'video' ? 'Video' : 'Image'} with caption: ${caption}`
        : `${settings.messageType === 'video' ? 'Video' : 'Image'} message`
    }
    default:
      return 'WhatsApp follow-up message'
  }
}

const DEFAULT_FAILED_CALL_TEXT =
  'Hi {{lead_name}}, we tried calling you but could not reach you. Please reply when you are available.'

const PROMPT_EXPIRY_MS = 24 * 60 * 60 * 1000

async function loadLeadForFailedCallWhatsApp(leadId: string) {
  const supabase = createServiceClient()
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, lead_id, phone, name, meta_data, requirement')
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr) throw new Error(leadErr.message)
  if (!lead) return null

  const row = lead as {
    id: string
    lead_id?: string
    phone: string
    name?: string | null
    meta_data?: Record<string, unknown> | null
    requirement?: string | null
  }

  return {
    id: row.id,
    leadIdDisplay: row.lead_id ?? row.id,
    phone: row.phone?.trim() || null,
    name: row.name ?? null,
    car: getLeadVehicleName(row),
  }
}

async function getFailedCallWhatsAppLogStatus(
  mcubeCallId: string
): Promise<'sent' | 'failed' | 'dismissed' | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('mcube_failed_call_whatsapp_log')
    .select('status')
    .eq('mcube_call_id', mcubeCallId)
    .maybeSingle()
  const status = (data as { status?: string } | null)?.status
  if (status === 'sent' || status === 'failed' || status === 'dismissed') return status
  return null
}

async function hasPendingFailedCallPrompt(mcubeCallId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('mcube_failed_call_whatsapp_prompts')
    .select('id')
    .eq('mcube_call_id', mcubeCallId)
    .eq('status', 'pending')
    .maybeSingle()
  return Boolean(data)
}

/** Webhook entry: queue caller approval or send immediately based on settings. */
export async function handleFailedCallWhatsApp(
  params: MaybeSendFailedCallWhatsAppParams
): Promise<{ sent: boolean; queued?: boolean; skipped?: string; error?: string }> {
  if (!shouldSendFailedCallWhatsApp(params)) {
    return { sent: false, skipped: 'conditions_not_met' }
  }

  const settings = await getMcubeFailedCallWhatsAppSettings()
  if (!settings.enabled) return { sent: false, skipped: 'disabled' }

  const configError = validateMcubeFailedCallWhatsAppConfig(settings)
  if (configError) return { sent: false, skipped: 'not_configured', error: configError }

  const logStatus = await getFailedCallWhatsAppLogStatus(params.mcubeCallId)
  if (logStatus === 'sent' || logStatus === 'dismissed') {
    return { sent: false, skipped: 'already_handled' }
  }
  if (await hasPendingFailedCallPrompt(params.mcubeCallId)) {
    return { sent: false, skipped: 'already_queued' }
  }

  if (settings.requireCallerApproval) {
    if (!params.callerUserId) {
      return executeFailedCallWhatsAppSend(params)
    }
    const queued = await queueFailedCallWhatsAppPrompt(params, settings)
    return queued ? { sent: false, queued: true } : { sent: false, skipped: 'queue_failed' }
  }

  return executeFailedCallWhatsAppSend(params)
}

async function queueFailedCallWhatsAppPrompt(
  params: MaybeSendFailedCallWhatsAppParams,
  settings: McubeFailedCallWhatsAppSettings
): Promise<boolean> {
  const lead = await loadLeadForFailedCallWhatsApp(params.leadId)
  if (!lead || !params.callerUserId) return false

  let templateName: string | null = null
  if (settings.messageType === 'template' && settings.templateId) {
    const templateRow = await getTemplateById(settings.templateId)
    templateName = templateRow?.name ?? null
  }

  const preview = buildFailedCallMessagePreview(settings, lead.name, lead.car, templateName)
  const supabase = createServiceClient()
  const { error } = await supabase.from('mcube_failed_call_whatsapp_prompts').insert({
    call_id: params.callId,
    mcube_call_id: params.mcubeCallId,
    lead_id: params.leadId,
    caller_user_id: params.callerUserId,
    dial_status: params.dialStatus,
    status: 'pending',
    message_preview: preview,
  } as never)

  if (error) {
    console.error('[mcube-failed-call-whatsapp] prompt insert failed', error.message)
    return false
  }
  return true
}

export async function getPendingFailedCallWhatsAppPromptsForUser(
  userId: string
): Promise<FailedCallWhatsAppPromptRow[]> {
  const supabase = createServiceClient()
  const expiryCutoff = new Date(Date.now() - PROMPT_EXPIRY_MS).toISOString()

  await supabase
    .from('mcube_failed_call_whatsapp_prompts')
    .update({ status: 'expired', responded_at: new Date().toISOString() } as never)
    .eq('caller_user_id', userId)
    .eq('status', 'pending')
    .lt('created_at', expiryCutoff)

  const { data, error } = await supabase
    .from('mcube_failed_call_whatsapp_prompts')
    .select(
      'id, call_id, mcube_call_id, lead_id, caller_user_id, dial_status, status, message_preview, error, created_at'
    )
    .eq('caller_user_id', userId)
    .eq('status', 'pending')
    .gte('created_at', expiryCutoff)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  const prompts = (data || []) as FailedCallWhatsAppPromptRow[]
  if (prompts.length === 0) return []

  const leadIds = [...new Set(prompts.map((p) => p.lead_id))]
  const { data: leads } = await supabase
    .from('leads')
    .select('id, lead_id, name, phone')
    .in('id', leadIds)

  const leadById = new Map(
    ((leads || []) as { id: string; lead_id: string; name: string; phone: string | null }[]).map((l) => [
      l.id,
      l,
    ])
  )

  return prompts.map((p) => ({
    ...p,
    lead: leadById.get(p.lead_id) ?? null,
  }))
}

export async function respondToFailedCallWhatsAppPrompt(params: {
  promptId: string
  userId: string
  action: 'approve' | 'dismiss'
}): Promise<{ ok: boolean; sent?: boolean; error?: string }> {
  const supabase = createServiceClient()
  const { data: prompt, error: promptErr } = await supabase
    .from('mcube_failed_call_whatsapp_prompts')
    .select('*')
    .eq('id', params.promptId)
    .maybeSingle()

  if (promptErr) throw new Error(promptErr.message)
  if (!prompt) return { ok: false, error: 'Prompt not found' }

  const row = prompt as {
    id: string
    call_id: string | null
    mcube_call_id: string
    lead_id: string
    caller_user_id: string
    dial_status: string | null
    status: string
  }

  if (row.caller_user_id !== params.userId) {
    return { ok: false, error: 'Forbidden' }
  }
  if (row.status !== 'pending') {
    return { ok: false, error: 'Prompt already handled' }
  }

  const now = new Date().toISOString()

  if (params.action === 'dismiss') {
    await supabase
      .from('mcube_failed_call_whatsapp_prompts')
      .update({
        status: 'dismissed',
        responded_at: now,
        responded_by: params.userId,
      } as never)
      .eq('id', params.promptId)

    const settings = await getMcubeFailedCallWhatsAppSettings()
    await recordFailedCallWhatsAppLog({
      callId: row.call_id ?? '',
      mcubeCallId: row.mcube_call_id,
      leadId: row.lead_id,
      templateId: settings.templateId,
      messageType: settings.messageType,
      dialStatus: row.dial_status,
      status: 'dismissed',
    })

    return { ok: true, sent: false }
  }

  await supabase
    .from('mcube_failed_call_whatsapp_prompts')
    .update({
      status: 'approved',
      responded_at: now,
      responded_by: params.userId,
    } as never)
    .eq('id', params.promptId)

  const sendResult = await executeFailedCallWhatsAppSend({
    leadId: row.lead_id,
    callId: row.call_id ?? '',
    mcubeCallId: row.mcube_call_id,
    callerUserId: row.caller_user_id,
    outcome: 'not_reachable',
    dialStatus: row.dial_status,
    sessionId: null,
    direction: 'outbound',
  })

  const finalStatus = sendResult.sent ? 'sent' : 'failed'
  await supabase
    .from('mcube_failed_call_whatsapp_prompts')
    .update({
      status: finalStatus,
      error: sendResult.error ?? null,
    } as never)
    .eq('id', params.promptId)

  return {
    ok: sendResult.sent || !sendResult.error,
    sent: sendResult.sent,
    error: sendResult.error,
  }
}

export async function maybeSendFailedCallWhatsAppTemplate(
  params: MaybeSendFailedCallWhatsAppParams
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const result = await handleFailedCallWhatsApp(params)
  return {
    sent: result.sent,
    skipped: result.skipped,
    error: result.error,
  }
}

export async function executeFailedCallWhatsAppSend(
  params: MaybeSendFailedCallWhatsAppParams
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  if (!shouldSendFailedCallWhatsApp(params)) {
    return { sent: false, skipped: 'conditions_not_met' }
  }

  const settings = await getMcubeFailedCallWhatsAppSettings()
  if (!settings.enabled) return { sent: false, skipped: 'disabled' }

  const configError = validateMcubeFailedCallWhatsAppConfig(settings)
  if (configError) return { sent: false, skipped: 'not_configured', error: configError }

  const logStatus = await getFailedCallWhatsAppLogStatus(params.mcubeCallId)
  if (logStatus === 'sent') {
    return { sent: false, skipped: 'already_sent' }
  }
  if (logStatus === 'dismissed') {
    return { sent: false, skipped: 'dismissed' }
  }

  const lead = await loadLeadForFailedCallWhatsApp(params.leadId)
  if (!lead) return { sent: false, skipped: 'lead_not_found' }

  if (!lead.phone) {
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
    phone: lead.phone,
    leadName: lead.name,
    leadCar: lead.car,
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
    phone: lead.phone,
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
  status: 'sent' | 'failed' | 'dismissed'
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
    { onConflict: 'mcube_call_id' }
  )
  if (error) {
    console.error('[mcube-failed-call-whatsapp] log insert failed', error.message)
  }
}
