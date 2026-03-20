import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { resolveBroadcastPayload, BroadcastValidationError } from '@/backend/services/whatsapp-broadcast-resolve'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  templateId: z.string().uuid().optional(),
  templateName: z.string().min(1).optional(),
  templateLanguage: z.string().optional().default('en'),
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(5000),
  bodyParameters: z.array(z.string()).optional(),
  headerParameters: z.array(z.string()).optional(),
  defaultCountryCode: z.string().max(4).optional().default('91'),
  delayMs: z.number().min(0).max(60000).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const { wabaConfig } = await getResolvedWhatsAppConfig(user?.id)
    if (!wabaConfig) {
      return NextResponse.json(
        { error: 'WhatsApp API not configured. Link in Settings → Integrations or set env vars.' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const parsed = scheduleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    let scheduledAt = new Date(parsed.data.scheduledAt)
    const adjustedToNow = scheduledAt.getTime() <= Date.now()
    if (adjustedToNow) scheduledAt = new Date()

    let resolvedPayload
    try {
      resolvedPayload = await resolveBroadcastPayload(
        {
          templateId: parsed.data.templateId,
          templateName: parsed.data.templateName,
          templateLanguage: parsed.data.templateLanguage,
          recipients: parsed.data.recipients,
          bodyParameters: parsed.data.bodyParameters,
          headerParameters: parsed.data.headerParameters,
          defaultCountryCode: parsed.data.defaultCountryCode,
          delayMs: parsed.data.delayMs,
        },
        wabaConfig
      )
    } catch (err) {
      if (err instanceof BroadcastValidationError) {
        return NextResponse.json(err.body, { status: err.statusCode })
      }
      throw err
    }

    const supabase = createServiceClient()
    const { data: row, error } = await supabase
      .from('scheduled_broadcasts')
      .insert({
        scheduled_at: scheduledAt.toISOString(),
        payload_json: resolvedPayload,
        status: 'pending',
        created_by: user?.id ?? null,
      } as never)
      .select('id, scheduled_at, status')
      .single()

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'scheduled_broadcasts table not found. Run migration 031.' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // insert(... as never) prevents Supabase from inferring row shape; assert explicitly
    type ScheduledBroadcastRow = { id: string; scheduled_at: string; status: string }
    const inserted = row as ScheduledBroadcastRow | null
    if (!inserted) {
      return NextResponse.json({ error: 'Failed to create scheduled broadcast' }, { status: 500 })
    }

    return NextResponse.json({
      id: inserted.id,
      scheduledAt: inserted.scheduled_at,
      status: inserted.status,
      adjustedToNow: adjustedToNow ?? false,
      message: adjustedToNow
        ? 'Scheduled time was in the past; job is due now. Vercel Cron (every minute) or "Process scheduled broadcasts now" will send it.'
        : `Broadcast scheduled for ${scheduledAt.toLocaleString()}. Vercel Cron (every minute) or "Process scheduled broadcasts now" will send it.`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to schedule broadcast' },
      { status: 500 }
    )
  }
}
