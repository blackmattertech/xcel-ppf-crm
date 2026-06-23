import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import {
  validateMcubeFailedCallWhatsAppConfig,
  type McubeFailedCallMessageType,
} from '@/backend/services/mcube-failed-call-whatsapp.service'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const messageTypeSchema = z.enum(['template', 'text', 'image', 'video'])

const updateSchema = z.object({
  hideConnectedWhenLastMcubeNotConnected: z.boolean().optional(),
  failedCallWhatsappEnabled: z.boolean().optional(),
  failedCallWhatsappMessageType: messageTypeSchema.optional(),
  failedCallWhatsappTemplateId: z.string().uuid().nullable().optional(),
  failedCallWhatsappBodyParameters: z.array(z.string()).optional(),
  failedCallWhatsappHeaderParameters: z.array(z.string()).optional(),
  failedCallWhatsappMessageBody: z.string().max(4096).nullable().optional(),
  failedCallWhatsappMediaUrl: z.string().url().nullable().optional(),
  failedCallWhatsappMediaMimeType: z.string().max(100).nullable().optional(),
  failedCallWhatsappMediaFileName: z.string().max(255).nullable().optional(),
  failedCallWhatsappMediaMetaId: z.string().max(255).nullable().optional(),
})

function isAdminRole(roleName: string | null | undefined): boolean {
  return roleName === 'admin' || roleName === 'super_admin'
}

type McubeSettingsRow = {
  hide_connected_when_last_mcube_not_connected: boolean
  failed_call_whatsapp_enabled: boolean
  failed_call_whatsapp_message_type: string
  failed_call_whatsapp_template_id: string | null
  failed_call_whatsapp_body_parameters: unknown
  failed_call_whatsapp_header_parameters: unknown
  failed_call_whatsapp_message_body: string | null
  failed_call_whatsapp_media_url: string | null
  failed_call_whatsapp_media_mime_type: string | null
  failed_call_whatsapp_media_file_name: string | null
  failed_call_whatsapp_media_meta_id: string | null
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function toApiSettings(row: McubeSettingsRow | null) {
  const messageType = row?.failed_call_whatsapp_message_type
  return {
    hideConnectedWhenLastMcubeNotConnected:
      row?.hide_connected_when_last_mcube_not_connected ?? true,
    failedCallWhatsappEnabled: Boolean(row?.failed_call_whatsapp_enabled),
    failedCallWhatsappMessageType:
      (messageType === 'text' || messageType === 'image' || messageType === 'video'
        ? messageType
        : 'template') as McubeFailedCallMessageType,
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

const SETTINGS_SELECT = `
  hide_connected_when_last_mcube_not_connected,
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

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('mcube_settings')
      .select(SETTINGS_SELECT)
      .eq('id', true)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Failed to load MCUBE settings' }, { status: 500 })
    }

    return NextResponse.json({
      settings: toApiSettings(data as McubeSettingsRow | null),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    if (!isAdminRole(authResult.user.role?.name)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: currentRow } = await supabase
      .from('mcube_settings')
      .select(SETTINGS_SELECT)
      .eq('id', true)
      .maybeSingle()

    const current = toApiSettings(currentRow as McubeSettingsRow | null)
    const merged = {
      ...current,
      ...(parsed.data.failedCallWhatsappEnabled !== undefined
        ? { failedCallWhatsappEnabled: parsed.data.failedCallWhatsappEnabled }
        : {}),
      ...(parsed.data.failedCallWhatsappMessageType !== undefined
        ? { failedCallWhatsappMessageType: parsed.data.failedCallWhatsappMessageType }
        : {}),
      ...(parsed.data.failedCallWhatsappTemplateId !== undefined
        ? { failedCallWhatsappTemplateId: parsed.data.failedCallWhatsappTemplateId }
        : {}),
      ...(parsed.data.failedCallWhatsappBodyParameters !== undefined
        ? { failedCallWhatsappBodyParameters: parsed.data.failedCallWhatsappBodyParameters }
        : {}),
      ...(parsed.data.failedCallWhatsappHeaderParameters !== undefined
        ? { failedCallWhatsappHeaderParameters: parsed.data.failedCallWhatsappHeaderParameters }
        : {}),
      ...(parsed.data.failedCallWhatsappMessageBody !== undefined
        ? { failedCallWhatsappMessageBody: parsed.data.failedCallWhatsappMessageBody }
        : {}),
      ...(parsed.data.failedCallWhatsappMediaUrl !== undefined
        ? { failedCallWhatsappMediaUrl: parsed.data.failedCallWhatsappMediaUrl }
        : {}),
      ...(parsed.data.failedCallWhatsappMediaMimeType !== undefined
        ? { failedCallWhatsappMediaMimeType: parsed.data.failedCallWhatsappMediaMimeType }
        : {}),
      ...(parsed.data.failedCallWhatsappMediaFileName !== undefined
        ? { failedCallWhatsappMediaFileName: parsed.data.failedCallWhatsappMediaFileName }
        : {}),
      ...(parsed.data.failedCallWhatsappMediaMetaId !== undefined
        ? { failedCallWhatsappMediaMetaId: parsed.data.failedCallWhatsappMediaMetaId }
        : {}),
    }

    if (merged.failedCallWhatsappEnabled) {
      const configError = validateMcubeFailedCallWhatsAppConfig({
        messageType: merged.failedCallWhatsappMessageType,
        templateId: merged.failedCallWhatsappTemplateId,
        messageBody: merged.failedCallWhatsappMessageBody,
        mediaUrl: merged.failedCallWhatsappMediaUrl,
      })
      if (configError) {
        return NextResponse.json({ error: configError }, { status: 400 })
      }

      if (merged.failedCallWhatsappMessageType === 'template' && merged.failedCallWhatsappTemplateId) {
        const { data: tpl } = await supabase
          .from('whatsapp_templates')
          .select('id, status')
          .eq('id', merged.failedCallWhatsappTemplateId)
          .maybeSingle()
        if (!tpl) {
          return NextResponse.json({ error: 'WhatsApp template not found' }, { status: 400 })
        }
        if ((tpl as { status: string }).status !== 'approved') {
          return NextResponse.json(
            { error: 'Only approved WhatsApp templates can be used for failed-call automation' },
            { status: 400 }
          )
        }
      }
    }

    const patch: Record<string, unknown> = {
      id: true,
      updated_by: authResult.user.id,
    }

    if (parsed.data.hideConnectedWhenLastMcubeNotConnected !== undefined) {
      patch.hide_connected_when_last_mcube_not_connected =
        parsed.data.hideConnectedWhenLastMcubeNotConnected
    }
    if (parsed.data.failedCallWhatsappEnabled !== undefined) {
      patch.failed_call_whatsapp_enabled = parsed.data.failedCallWhatsappEnabled
    }
    if (parsed.data.failedCallWhatsappMessageType !== undefined) {
      patch.failed_call_whatsapp_message_type = parsed.data.failedCallWhatsappMessageType
    }
    if (parsed.data.failedCallWhatsappTemplateId !== undefined) {
      patch.failed_call_whatsapp_template_id = parsed.data.failedCallWhatsappTemplateId
    }
    if (parsed.data.failedCallWhatsappBodyParameters !== undefined) {
      patch.failed_call_whatsapp_body_parameters = parsed.data.failedCallWhatsappBodyParameters
    }
    if (parsed.data.failedCallWhatsappHeaderParameters !== undefined) {
      patch.failed_call_whatsapp_header_parameters = parsed.data.failedCallWhatsappHeaderParameters
    }
    if (parsed.data.failedCallWhatsappMessageBody !== undefined) {
      patch.failed_call_whatsapp_message_body = parsed.data.failedCallWhatsappMessageBody
    }
    if (parsed.data.failedCallWhatsappMediaUrl !== undefined) {
      patch.failed_call_whatsapp_media_url = parsed.data.failedCallWhatsappMediaUrl
    }
    if (parsed.data.failedCallWhatsappMediaMimeType !== undefined) {
      patch.failed_call_whatsapp_media_mime_type = parsed.data.failedCallWhatsappMediaMimeType
    }
    if (parsed.data.failedCallWhatsappMediaFileName !== undefined) {
      patch.failed_call_whatsapp_media_file_name = parsed.data.failedCallWhatsappMediaFileName
    }
    if (parsed.data.failedCallWhatsappMediaMetaId !== undefined) {
      patch.failed_call_whatsapp_media_meta_id = parsed.data.failedCallWhatsappMediaMetaId
    }

    const { error } = await supabase.from('mcube_settings').upsert(patch as never)

    if (error) {
      return NextResponse.json({ error: 'Failed to update MCUBE settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
