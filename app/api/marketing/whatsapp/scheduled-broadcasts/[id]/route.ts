import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import {
  resolveBroadcastPayload,
  BroadcastValidationError,
  type ResolvedBroadcastPayload,
} from '@/backend/services/whatsapp-broadcast-resolve'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const patchSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(5000).optional(),
  bodyParameters: z.array(z.string()).optional(),
  headerParameters: z.array(z.string()).optional(),
  delayMs: z.number().min(0).max(60000).optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

type ScheduledBroadcastDbRow = {
  id: string
  scheduled_at: string
  status: string
  created_at: string
  payload_json: ResolvedBroadcastPayload
  error_message: string | null
  created_by: string | null
}

async function loadOwnedRow(supabase: ReturnType<typeof createServiceClient>, id: string, userId: string) {
  const { data, error } = await supabase
    .from('scheduled_broadcasts')
    .select('id, scheduled_at, status, created_at, payload_json, error_message, created_by')
    .eq('id', id)
    .single()

  if (error || !data) return { error: NextResponse.json({ error: 'Scheduled broadcast not found' }, { status: 404 }) }
  const row = data as ScheduledBroadcastDbRow
  if (row.created_by !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { row }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult
    if (!user?.id) return NextResponse.json({ error: 'User id missing' }, { status: 400 })

    const { id } = await context.params
    const supabase = createServiceClient()
    const loaded = await loadOwnedRow(supabase, id, user.id)
    if ('error' in loaded) return loaded.error

    const row = loaded.row as {
      id: string
      scheduled_at: string
      status: string
      created_at: string
      payload_json: ResolvedBroadcastPayload
      error_message: string | null
    }
    const payload = row.payload_json

    return NextResponse.json({
      id: row.id,
      scheduledAt: row.scheduled_at,
      status: row.status,
      createdAt: row.created_at,
      errorMessage: row.error_message,
      payload: {
        templateName: payload.templateName,
        templateLanguage: payload.templateLanguage,
        delayMs: payload.delayMs,
        defaultCountryCode: payload.defaultCountryCode,
        headerParameters: payload.headerParameters,
        recipients: payload.recipients,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load scheduled broadcast' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult
    if (!user?.id) return NextResponse.json({ error: 'User id missing' }, { status: 400 })

    const { id } = await context.params
    const supabase = createServiceClient()
    const loaded = await loadOwnedRow(supabase, id, user.id)
    if ('error' in loaded) return loaded.error

    const row = loaded.row as {
      id: string
      scheduled_at: string
      status: string
      payload_json: ResolvedBroadcastPayload
    }

    if (row.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending broadcasts can be edited. Completed or failed jobs cannot be changed.' },
        { status: 409 }
      )
    }

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
    if (!wabaConfig) {
      return NextResponse.json(
        { error: 'WhatsApp API not configured. Link in Settings → Integrations or set env vars.' },
        { status: 503 }
      )
    }

    const existing = row.payload_json
    const recipientsInput = parsed.data.recipients ?? existing.recipients.map((r) => ({ phone: r.phone }))
    const bodyParamsFromExisting = existing.recipients[0]?.bodyParameters

    let scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : new Date(row.scheduled_at)
    if (parsed.data.scheduledAt) {
      const adjustedToNow = scheduledAt.getTime() <= Date.now()
      if (adjustedToNow) scheduledAt = new Date()
    }

    let resolvedPayload: ResolvedBroadcastPayload
    try {
      resolvedPayload = await resolveBroadcastPayload(
        {
          templateName: existing.templateName,
          templateLanguage: existing.templateLanguage,
          recipients: recipientsInput,
          bodyParameters: parsed.data.bodyParameters ?? bodyParamsFromExisting,
          headerParameters: parsed.data.headerParameters ?? existing.headerParameters,
          defaultCountryCode: existing.defaultCountryCode,
          delayMs: parsed.data.delayMs ?? existing.delayMs,
        },
        wabaConfig
      )
    } catch (err) {
      if (err instanceof BroadcastValidationError) {
        return NextResponse.json(err.body, { status: err.statusCode })
      }
      throw err
    }

    const { data: updated, error: updateError } = await supabase
      .from('scheduled_broadcasts')
      .update({
        scheduled_at: scheduledAt.toISOString(),
        payload_json: resolvedPayload,
        error_message: null,
      } as never)
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, scheduled_at, status')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    type UpdatedRow = { id: string; scheduled_at: string; status: string }
    const u = updated as UpdatedRow | null
    if (!u) {
      return NextResponse.json({ error: 'Update failed (broadcast may have started processing)' }, { status: 409 })
    }

    return NextResponse.json({
      id: u.id,
      scheduledAt: u.scheduled_at,
      status: u.status,
      recipientCount: resolvedPayload.recipients.length,
      message: 'Scheduled broadcast updated.',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update scheduled broadcast' },
      { status: 500 }
    )
  }
}
