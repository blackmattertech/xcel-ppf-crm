/**
 * When admin enables MCube failed-call WhatsApp in settings, send an approved template
 * after outbound MCube hangup with outcome not_reachable (no answer, busy, cancel, etc.).
 */

import { createServiceClient } from '@/lib/supabase/service'
import type { CallOutcome } from '@/shared/constants/lead-status'
import { mapDialStatusToOutcome } from '@/backend/services/mcube.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import {
  BroadcastValidationError,
  resolveBroadcastPayload,
} from '@/backend/services/whatsapp-broadcast-resolve'
import { sendTemplateMessage } from '@/backend/services/whatsapp.service'
import { getTemplateById } from '@/backend/services/whatsapp-template.service'
import { saveOutgoingMessage } from '@/backend/services/whatsapp-chat.service'

export interface McubeFailedCallWhatsAppSettings {
  enabled: boolean
  templateId: string | null
  bodyParameters: string[]
  headerParameters: string[]
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

export async function getMcubeFailedCallWhatsAppSettings(): Promise<McubeFailedCallWhatsAppSettings> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('mcube_settings')
    .select(
      'failed_call_whatsapp_enabled, failed_call_whatsapp_template_id, failed_call_whatsapp_body_parameters, failed_call_whatsapp_header_parameters'
    )
    .eq('id', true)
    .maybeSingle()

  if (error) throw new Error(`Failed to load MCube WhatsApp settings: ${error.message}`)

  const row = data as {
    failed_call_whatsapp_enabled?: boolean
    failed_call_whatsapp_template_id?: string | null
    failed_call_whatsapp_body_parameters?: unknown
    failed_call_whatsapp_header_parameters?: unknown
  } | null

  return {
    enabled: Boolean(row?.failed_call_whatsapp_enabled),
    templateId: row?.failed_call_whatsapp_template_id ?? null,
    bodyParameters: parseStringArrayJson(row?.failed_call_whatsapp_body_parameters),
    headerParameters: parseStringArrayJson(row?.failed_call_whatsapp_header_parameters),
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
  // Only CRM-initiated outbound (session exists) or explicit outbound direction.
  if (!params.sessionId && params.direction !== 'outbound') return false
  // Belt-and-suspenders: dial status must map to not_reachable (excludes ANSWER/ANSWERED).
  if (mapDialStatusToOutcome(params.dialStatus) !== 'not_reachable') return false
  return true
}

function applyLeadNameToken(params: string[], leadName: string | null): string[] {
  const name = leadName?.trim() || 'there'
  return params.map((p) => p.replace(/\{\{lead_name\}\}/gi, name))
}

function toTemplatePreviewBody(templateName: string): string {
  return `[MCube failed call · Template: ${templateName}]`
}

export async function maybeSendFailedCallWhatsAppTemplate(
  params: MaybeSendFailedCallWhatsAppParams
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  if (!shouldSendFailedCallWhatsApp(params)) {
    return { sent: false, skipped: 'conditions_not_met' }
  }

  const settings = await getMcubeFailedCallWhatsAppSettings()
  if (!settings.enabled) return { sent: false, skipped: 'disabled' }
  if (!settings.templateId) return { sent: false, skipped: 'no_template' }

  const supabase = createServiceClient()

  const { data: existingLog } = await supabase
    .from('mcube_failed_call_whatsapp_log')
    .select('id')
    .eq('mcube_call_id', params.mcubeCallId)
    .maybeSingle()
  if (existingLog) return { sent: false, skipped: 'already_sent' }

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, name')
    .eq('id', params.leadId)
    .maybeSingle()
  if (leadErr) throw new Error(leadErr.message)
  if (!lead) return { sent: false, skipped: 'lead_not_found' }

  const phone = (lead as { phone: string }).phone?.trim()
  if (!phone) {
    await recordFailedCallWhatsAppLog({
      callId: params.callId,
      mcubeCallId: params.mcubeCallId,
      leadId: params.leadId,
      templateId: settings.templateId,
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
      dialStatus: params.dialStatus,
      status: 'failed',
      error: 'WhatsApp API not configured',
    })
    return { sent: false, error: 'WhatsApp API not configured' }
  }

  const leadName = (lead as { name?: string | null }).name ?? null
  const bodyParameters = applyLeadNameToken(settings.bodyParameters, leadName)
  const headerParameters =
    settings.headerParameters.length > 0
      ? applyLeadNameToken(settings.headerParameters, leadName)
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
    await recordFailedCallWhatsAppLog({
      callId: params.callId,
      mcubeCallId: params.mcubeCallId,
      leadId: params.leadId,
      templateId: settings.templateId,
      dialStatus: params.dialStatus,
      status: 'failed',
      error: message,
    })
    return { sent: false, error: message }
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

  if (!result.success) {
    await recordFailedCallWhatsAppLog({
      callId: params.callId,
      mcubeCallId: params.mcubeCallId,
      leadId: params.leadId,
      templateId: settings.templateId,
      dialStatus: params.dialStatus,
      status: 'failed',
      error: result.error ?? 'Send failed',
    })
    return { sent: false, error: result.error ?? 'Send failed' }
  }

  const templateRow = await getTemplateById(settings.templateId)
  await saveOutgoingMessage({
    leadId: params.leadId,
    phone,
    body: toTemplatePreviewBody(payload.templateName),
    metaMessageId: result.messageId ?? undefined,
    templateName: payload.templateName,
    metaTemplateId: templateRow?.meta_id ?? null,
  })

  await recordFailedCallWhatsAppLog({
    callId: params.callId,
    mcubeCallId: params.mcubeCallId,
    leadId: params.leadId,
    templateId: settings.templateId,
    dialStatus: params.dialStatus,
    status: 'sent',
    wamid: result.messageId ?? null,
  })

  return { sent: true }
}

async function recordFailedCallWhatsAppLog(row: {
  callId: string
  mcubeCallId: string
  leadId: string
  templateId: string
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
