import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { applyLeadJourneyAfterCall } from '@/backend/services/call-lead-journey.service'
import {
  parseMcubeTimestamp,
  parseAnsweredTimeToSeconds,
  mapDialStatusToOutcome,
  findLeadIdByCustomerPhone,
  findUserIdByAgentPhone,
  isHangupEvent,
  type McubeWebhookPayload,
} from '@/backend/services/mcube.service'
import { invalidateLeadCaches } from '@/lib/cache-invalidation'

const mcubeBodySchema = z.object({
  starttime: z.string().optional(),
  callid: z.string().min(1),
  emp_phone: z.string().optional(),
  clicktocalldid: z.string().optional(),
  callto: z.string().optional(),
  dialstatus: z.string().optional(),
  filename: z.string().optional(),
  direction: z.string().optional(),
  endtime: z.string().optional(),
  disconnectedby: z.string().optional(),
  answeredtime: z.string().optional(),
  groupname: z.string().optional(),
  agentname: z.string().optional(),
  refid: z.string().optional(),
  event: z.string().optional(),
})

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuidString(s: string): boolean {
  return UUID_RE.test(s)
}

function formatSecondsToAnsweredTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function normalizeDialStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const s = raw.trim().toUpperCase()
  if (s === 'ANSWERED') return 'ANSWER'
  return s
}

function normalizeIncomingPayload(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const r = body as Record<string, unknown>

  // Existing native shape already handled.
  if (typeof r.callid === 'string') return body

  // Alternate MCUBE payload shape (TitleCase keys).
  const callSessionId = String(r.CallSessionId ?? '').trim()
  if (!callSessionId) return body

  const starttime = String(r.StartTime ?? '').trim() || undefined
  const durationRaw = String(r.CallDuration ?? '').trim()
  const durationSec = /^\d+$/.test(durationRaw) ? parseInt(durationRaw, 10) : null
  let endtime: string | undefined
  if (starttime && durationSec != null) {
    const startIso = parseMcubeTimestamp(starttime)
    if (startIso) {
      const end = new Date(new Date(startIso).getTime() + durationSec * 1000)
      endtime = end
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '')
        .slice(0, 19)
    }
  }

  return {
    callid: callSessionId,
    emp_phone: String(r.SourceNumber ?? '').trim() || undefined,
    callto: String(r.DestinationNumber ?? '').trim() || undefined,
    clicktocalldid: String(r.DisplayNumber ?? '').trim() || undefined,
    dialstatus: normalizeDialStatus(String(r.Status ?? '').trim() || undefined),
    starttime,
    endtime,
    answeredtime:
      durationSec != null ? formatSecondsToAnsweredTime(durationSec) : undefined,
    filename: String(r.ResourceURL ?? '').trim() || undefined,
    direction: String(r.Direction ?? '').trim() || undefined,
    // This payload is typically final hangup callback.
    event: 'hangup',
  }
}

function computeDurationSeconds(payload: McubeWebhookPayload): number | null {
  const fromAnswered = parseAnsweredTimeToSeconds(payload.answeredtime)
  if (fromAnswered != null) return fromAnswered
  const end = parseMcubeTimestamp(payload.endtime ?? null)
  const start = parseMcubeTimestamp(payload.starttime ?? null)
  if (end && start) {
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000))
  }
  return null
}

function normalizeDirection(
  raw: string | undefined
): 'inbound' | 'outbound' | null {
  const d = (raw ?? '').trim().toLowerCase()
  if (d === 'inbound' || d === 'outbound') return d
  return null
}

function deriveWebhookPhase(
  payload: McubeWebhookPayload & { event?: string }
): 'on_call' | 'on_hangup' {
  const ev = (payload.event ?? '').toLowerCase()
  if (ev.includes('hangup')) return 'on_hangup'
  if (ev.includes('on_call') || ev.includes('on call')) return 'on_call'
  return isHangupEvent(payload) ? 'on_hangup' : 'on_call'
}

async function handleOnCall(
  supabase: ReturnType<typeof createServiceClient>,
  payload: McubeWebhookPayload
): Promise<void> {
  if (payload.refid && isUuidString(payload.refid)) {
    await supabase
      .from('mcube_outbound_sessions')
      .update({ mcube_call_id: payload.callid } as never)
      .eq('id', payload.refid)
    return
  }

  const { data: byCall } = await supabase
    .from('mcube_outbound_sessions')
    .select('id')
    .eq('mcube_call_id', payload.callid)
    .maybeSingle()

  if (byCall && typeof (byCall as { id: string }).id === 'string') {
    return
  }

  const leadId = await findLeadIdByCustomerPhone(supabase, payload.callto ?? null)
  if (!leadId) return

  const { data: open } = await supabase
    .from('mcube_outbound_sessions')
    .select('id')
    .eq('lead_id', leadId)
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sid = (open as { id: string } | null)?.id
  if (sid) {
    await supabase
      .from('mcube_outbound_sessions')
      .update({ mcube_call_id: payload.callid } as never)
      .eq('id', sid)
  }
}

async function resolveLeadAndAgent(
  supabase: ReturnType<typeof createServiceClient>,
  payload: McubeWebhookPayload
): Promise<{
  leadId: string
  calledById: string
  sessionId: string | null
}> {
  let leadId: string | null = null
  let sessionId: string | null = null

  if (payload.refid && isUuidString(payload.refid)) {
    const { data: session } = await supabase
      .from('mcube_outbound_sessions')
      .select('id, lead_id')
      .eq('id', payload.refid)
      .maybeSingle()
    const s = session as { id: string; lead_id: string } | null
    if (s) {
      sessionId = s.id
      leadId = s.lead_id
    }
  }

  if (!leadId && payload.callid) {
    const { data: session } = await supabase
      .from('mcube_outbound_sessions')
      .select('id, lead_id')
      .eq('mcube_call_id', payload.callid)
      .maybeSingle()
    const s = session as { id: string; lead_id: string } | null
    if (s) {
      sessionId = s.id
      leadId = s.lead_id
    }
  }

  if (!leadId) {
    leadId = await findLeadIdByCustomerPhone(supabase, payload.callto ?? null)
  }

  if (!leadId) {
    throw new Error('Could not resolve lead for MCUBE call')
  }

  let calledById = await findUserIdByAgentPhone(supabase, payload.emp_phone ?? null)

  if (!calledById) {
    const { data: leadRow } = await supabase
      .from('leads')
      .select('assigned_to')
      .eq('id', leadId)
      .single()
    const assigned = (leadRow as { assigned_to: string | null } | null)?.assigned_to
    if (assigned) {
      calledById = assigned
    }
  }

  if (!calledById) {
    throw new Error('Could not resolve agent user for MCUBE call')
  }

  return { leadId, calledById, sessionId }
}

async function handleHangup(
  supabase: ReturnType<typeof createServiceClient>,
  payload: McubeWebhookPayload
): Promise<{ duplicate?: boolean }> {
  const { data: existing } = await supabase
    .from('calls')
    .select('id')
    .eq('mcube_call_id', payload.callid)
    .maybeSingle()

  if (existing) {
    return { duplicate: true }
  }

  const { leadId, calledById, sessionId } = await resolveLeadAndAgent(supabase, payload)

  const outcome = mapDialStatusToOutcome(payload.dialstatus)
  const durationSec = computeDurationSeconds(payload)
  const dir = normalizeDirection(payload.direction)

  const notes = [
    'MCUBE',
    payload.dialstatus ? `Status: ${payload.dialstatus}` : null,
    dir ? `Direction: ${dir}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const { error: insertError } = await supabase.from('calls').insert({
    lead_id: leadId,
    called_by: calledById,
    outcome,
    notes,
    call_duration: durationSec,
    mcube_call_id: payload.callid,
    recording_url: payload.filename?.trim() || null,
    started_at: parseMcubeTimestamp(payload.starttime ?? null),
    ended_at: parseMcubeTimestamp(payload.endtime ?? null),
    answered_duration_seconds: parseAnsweredTimeToSeconds(payload.answeredtime),
    dial_status: payload.dialstatus ?? null,
    direction: dir,
    disconnected_by: payload.disconnectedby?.trim() || null,
    mcube_group_name: payload.groupname?.trim() || null,
    mcube_agent_name: payload.agentname?.trim() || null,
    integration: 'mcube',
    mcube_session_id: sessionId,
    disposition: null,
  } as never)

  if (insertError) {
    throw new Error(insertError.message)
  }

  await applyLeadJourneyAfterCall({
    leadId,
    outcome,
    changedByUserId: calledById,
  })

  if (sessionId) {
    await supabase
      .from('mcube_outbound_sessions')
      .update({
        completed_at: new Date().toISOString(),
        mcube_call_id: payload.callid,
      } as never)
      .eq('id', sessionId)
  }

  await invalidateLeadCaches(leadId)
  return {}
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  body = normalizeIncomingPayload(body)

  const parsed = mcubeBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const payload = parsed.data as McubeWebhookPayload & { event?: string }
  const supabase = createServiceClient()
  const phase = deriveWebhookPhase(payload)
  console.info('[webhooks/mcube] full_payload', JSON.stringify(payload))
  console.info('[webhooks/mcube] received', {
    phase,
    callid: payload.callid,
    direction: payload.direction ?? null,
    hasEndtime: Boolean(payload.endtime),
  })

  try {
    if (phase === 'on_call') {
      await handleOnCall(supabase, payload)
      return NextResponse.json({ ok: true, phase: 'on_call' })
    }

    const result = await handleHangup(supabase, payload)
    if (result.duplicate) {
      console.info('[webhooks/mcube] duplicate hangup ignored', { callid: payload.callid })
      return NextResponse.json({ ok: true, duplicate: true })
    }
    console.info('[webhooks/mcube] hangup processed', { callid: payload.callid })
    return NextResponse.json({ ok: true, phase: 'on_hangup' })
  } catch (e) {
    console.error('[webhooks/mcube]', e)
    const message = e instanceof Error ? e.message : 'Webhook processing failed'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
