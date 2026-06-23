import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const updateSchema = z.object({
  hideConnectedWhenLastMcubeNotConnected: z.boolean().optional(),
  failedCallWhatsappEnabled: z.boolean().optional(),
  failedCallWhatsappTemplateId: z.string().uuid().nullable().optional(),
  failedCallWhatsappBodyParameters: z.array(z.string()).optional(),
  failedCallWhatsappHeaderParameters: z.array(z.string()).optional(),
})

function isAdminRole(roleName: string | null | undefined): boolean {
  return roleName === 'admin' || roleName === 'super_admin'
}

type McubeSettingsRow = {
  hide_connected_when_last_mcube_not_connected: boolean
  failed_call_whatsapp_enabled: boolean
  failed_call_whatsapp_template_id: string | null
  failed_call_whatsapp_body_parameters: unknown
  failed_call_whatsapp_header_parameters: unknown
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function toApiSettings(row: McubeSettingsRow | null) {
  return {
    hideConnectedWhenLastMcubeNotConnected:
      row?.hide_connected_when_last_mcube_not_connected ?? true,
    failedCallWhatsappEnabled: Boolean(row?.failed_call_whatsapp_enabled),
    failedCallWhatsappTemplateId: row?.failed_call_whatsapp_template_id ?? null,
    failedCallWhatsappBodyParameters: parseStringArray(row?.failed_call_whatsapp_body_parameters),
    failedCallWhatsappHeaderParameters: parseStringArray(row?.failed_call_whatsapp_header_parameters),
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('mcube_settings')
      .select(
        'hide_connected_when_last_mcube_not_connected, failed_call_whatsapp_enabled, failed_call_whatsapp_template_id, failed_call_whatsapp_body_parameters, failed_call_whatsapp_header_parameters'
      )
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

    if (parsed.data.failedCallWhatsappEnabled && parsed.data.failedCallWhatsappTemplateId) {
      const { data: tpl } = await supabase
        .from('whatsapp_templates')
        .select('id, status')
        .eq('id', parsed.data.failedCallWhatsappTemplateId)
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

    if (parsed.data.failedCallWhatsappEnabled && !parsed.data.failedCallWhatsappTemplateId) {
      const { data: current } = await supabase
        .from('mcube_settings')
        .select('failed_call_whatsapp_template_id')
        .eq('id', true)
        .maybeSingle()
      const currentTemplateId = (current as { failed_call_whatsapp_template_id: string | null } | null)
        ?.failed_call_whatsapp_template_id
      if (!currentTemplateId) {
        return NextResponse.json(
          { error: 'Select an approved WhatsApp template before enabling failed-call automation' },
          { status: 400 }
        )
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
    if (parsed.data.failedCallWhatsappTemplateId !== undefined) {
      patch.failed_call_whatsapp_template_id = parsed.data.failedCallWhatsappTemplateId
    }
    if (parsed.data.failedCallWhatsappBodyParameters !== undefined) {
      patch.failed_call_whatsapp_body_parameters = parsed.data.failedCallWhatsappBodyParameters
    }
    if (parsed.data.failedCallWhatsappHeaderParameters !== undefined) {
      patch.failed_call_whatsapp_header_parameters = parsed.data.failedCallWhatsappHeaderParameters
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
