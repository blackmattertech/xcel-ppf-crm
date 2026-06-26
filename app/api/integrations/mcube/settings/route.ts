import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { validateMcubeFailedCallWhatsAppConfig } from '@/backend/services/mcube-failed-call-whatsapp.service'
import {
  fetchMcubeSettingsRow,
  mcubeSettingsColumnExists,
  toApiMcubeSettings,
  type McubeSettingsRow,
} from '@/backend/services/mcube-settings.service'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const messageTypeSchema = z.enum(['template', 'text', 'image', 'video'])

const updateSchema = z.object({
  hideConnectedWhenLastMcubeNotConnected: z.boolean().optional(),
  failedCallWhatsappRequireCallerApproval: z.boolean().optional(),
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

function missingColumnError(column: string): string {
  return `Database column "${column}" is missing. Run pending MCube migrations (052–055) in Supabase.`
}

function assertColumnOrSkip(
  currentRow: McubeSettingsRow | null,
  column: keyof McubeSettingsRow,
  wantsValue: boolean
): string | null {
  if (mcubeSettingsColumnExists(currentRow, column)) return null
  if (wantsValue) return missingColumnError(column)
  return null
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const row = await fetchMcubeSettingsRow()
    return NextResponse.json({
      settings: toApiMcubeSettings(row),
    })
  } catch (error) {
    console.error('[mcube/settings] GET failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load MCUBE settings' },
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

    const currentRow = await fetchMcubeSettingsRow()
    const current = toApiMcubeSettings(currentRow)
    const merged = {
      ...current,
      ...(parsed.data.failedCallWhatsappRequireCallerApproval !== undefined
        ? { failedCallWhatsappRequireCallerApproval: parsed.data.failedCallWhatsappRequireCallerApproval }
        : {}),
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

      const supabase = createServiceClient()
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

    const failedCallFields: Array<{
      parsedKey: keyof z.infer<typeof updateSchema>
      column: keyof McubeSettingsRow
      patchKey: string
      value: unknown
      requiresTruthy?: boolean
    }> = [
      {
        parsedKey: 'failedCallWhatsappRequireCallerApproval',
        column: 'failed_call_whatsapp_require_caller_approval',
        patchKey: 'failed_call_whatsapp_require_caller_approval',
        value: parsed.data.failedCallWhatsappRequireCallerApproval,
      },
      {
        parsedKey: 'failedCallWhatsappEnabled',
        column: 'failed_call_whatsapp_enabled',
        patchKey: 'failed_call_whatsapp_enabled',
        value: parsed.data.failedCallWhatsappEnabled,
        requiresTruthy: true,
      },
      {
        parsedKey: 'failedCallWhatsappMessageType',
        column: 'failed_call_whatsapp_message_type',
        patchKey: 'failed_call_whatsapp_message_type',
        value: parsed.data.failedCallWhatsappMessageType,
      },
      {
        parsedKey: 'failedCallWhatsappTemplateId',
        column: 'failed_call_whatsapp_template_id',
        patchKey: 'failed_call_whatsapp_template_id',
        value: parsed.data.failedCallWhatsappTemplateId,
      },
      {
        parsedKey: 'failedCallWhatsappBodyParameters',
        column: 'failed_call_whatsapp_body_parameters',
        patchKey: 'failed_call_whatsapp_body_parameters',
        value: parsed.data.failedCallWhatsappBodyParameters,
      },
      {
        parsedKey: 'failedCallWhatsappHeaderParameters',
        column: 'failed_call_whatsapp_header_parameters',
        patchKey: 'failed_call_whatsapp_header_parameters',
        value: parsed.data.failedCallWhatsappHeaderParameters,
      },
      {
        parsedKey: 'failedCallWhatsappMessageBody',
        column: 'failed_call_whatsapp_message_body',
        patchKey: 'failed_call_whatsapp_message_body',
        value: parsed.data.failedCallWhatsappMessageBody,
      },
      {
        parsedKey: 'failedCallWhatsappMediaUrl',
        column: 'failed_call_whatsapp_media_url',
        patchKey: 'failed_call_whatsapp_media_url',
        value: parsed.data.failedCallWhatsappMediaUrl,
      },
      {
        parsedKey: 'failedCallWhatsappMediaMimeType',
        column: 'failed_call_whatsapp_media_mime_type',
        patchKey: 'failed_call_whatsapp_media_mime_type',
        value: parsed.data.failedCallWhatsappMediaMimeType,
      },
      {
        parsedKey: 'failedCallWhatsappMediaFileName',
        column: 'failed_call_whatsapp_media_file_name',
        patchKey: 'failed_call_whatsapp_media_file_name',
        value: parsed.data.failedCallWhatsappMediaFileName,
      },
      {
        parsedKey: 'failedCallWhatsappMediaMetaId',
        column: 'failed_call_whatsapp_media_meta_id',
        patchKey: 'failed_call_whatsapp_media_meta_id',
        value: parsed.data.failedCallWhatsappMediaMetaId,
      },
    ]

    for (const field of failedCallFields) {
      if (field.value === undefined) continue
      const columnError = assertColumnOrSkip(
        currentRow,
        field.column,
        field.requiresTruthy ? Boolean(field.value) : true
      )
      if (columnError) {
        return NextResponse.json({ error: columnError }, { status: 400 })
      }
      if (mcubeSettingsColumnExists(currentRow, field.column)) {
        patch[field.patchKey] = field.value
      }
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from('mcube_settings').upsert(patch as never)

    if (error) {
      console.error('[mcube/settings] PUT failed', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update MCUBE settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[mcube/settings] PUT unexpected', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
