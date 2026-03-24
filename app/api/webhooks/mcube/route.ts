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

const nullableText = z.string().nullable().optional().transform((v) => v ?? undefined)

const mcubeBodySchema = z.object({
  starttime: nullableText,
  callid: z.string().min(1),
  emp_phone: nullableText,
  clicktocalldid: nullableText,
  callto: nullableText,
  dialstatus: nullableText,
  filename: nullableText,
  direction: nullableText,
  endtime: nullableText,
  disconnectedby: nullableText,
  answeredtime: nullableText,
  groupname: nullableText,
  agentname: nullableText,
  refid: nullableText,
  event: nullableText,
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

function pickFirstObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickFirstObject(item)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const candidateKeys = ['data', 'Data', 'result', 'Result', 'payload', 'Payload', 'call', 'Call']
    for (const key of candidateKeys) {
      if (obj[key] !== undefined) {
        const found = pickFirstObject(obj[key])
        if (found) return found
      }
    }
    return obj
  }
  return null
}

function getString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null) {
      const s = String(v).trim()
      if (s) return s
    }
  }
  return undefined
}

function normalizeIncomingPayload(body: unknown): unknown {
  const r = pickFirstObject(body)
  if (!r) return body

  // Existing native shape already handled.
  if (typeof r.callid === 'string') return body

  // Alternate MCUBE payload shape (TitleCase keys).
  const callSessionId = getString(r, [
    'CallSessionId',
    'CallSessionID',
    'callSessionId',
    'callsessionid',
    'session_id',
    'sessionId',
  ])
  if (!callSessionId) return body

  const starttime = getString(r, ['StartTime', 'start_time', 'startTime', 'starttime'])
  const durationRaw = getString(r, ['CallDuration', 'call_duration', 'Duration', 'duration']) ?? ''
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
    emp_phone: getString(r, ['SourceNumber', 'source_number', 'emp_phone', 'empPhone']),
    callto: getString(r, ['DestinationNumber', 'destination_number', 'callto', 'custnumber']),
    clicktocalldid: getString(r, ['DisplayNumber', 'display_number', 'clicktocalldid']),
    dialstatus: normalizeDialStatus(getString(r, ['Status', 'status', 'dialstatus'])),
    starttime,
    endtime,
    answeredtime:
      durationSec != null ? formatSecondsToAnsweredTime(durationSec) : undefined,
    filename: getString(r, ['ResourceURL', 'resource_url', 'filename', 'recording_url']),
    direction: getString(r, ['Direction', 'direction']),
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
  let initiatedBy: string | null = null

  if (payload.refid && isUuidString(payload.refid)) {
    const { data: session } = await supabase
      .from('mcube_outbound_sessions')
      .select('id, lead_id, initiated_by')
      .eq('id', payload.refid)
      .maybeSingle()
    const s = session as { id: string; lead_id: string; initiated_by: string | null } | null
    if (s) {
      sessionId = s.id
      leadId = s.lead_id
      initiatedBy = s.initiated_by ?? null
    }
  }

  if (!leadId && payload.callid) {
    const { data: session } = await supabase
      .from('mcube_outbound_sessions')
      .select('id, lead_id, initiated_by')
      .eq('mcube_call_id', payload.callid)
      .maybeSingle()
    const s = session as { id: string; lead_id: string; initiated_by: string | null } | null
    if (s) {
      sessionId = s.id
      leadId = s.lead_id
      initiatedBy = s.initiated_by ?? null
    }
  }

  if (!leadId) {
    leadId = await findLeadIdByCustomerPhone(supabase, payload.callto ?? null)
  }

  if (!leadId) {
    throw new Error('Could not resolve lead for MCUBE call')
  }

  // Fallback: for outbound calls without explicit ref/session mapping,
  // use the latest session for this lead to recover initiating user.
  if (!sessionId) {
    const { data: latestSession } = await supabase
      .from('mcube_outbound_sessions')
      .select('id, initiated_by')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ls = latestSession as { id: string; initiated_by: string | null } | null
    if (ls) {
      sessionId = ls.id
      initiatedBy = ls.initiated_by ?? initiatedBy
    }
  }

  let calledById = await findUserIdByAgentPhone(supabase, payload.emp_phone ?? null)

  if (!calledById) {
    const configuredExec = process.env.MCUBE_EXECUTIVE_NUMBER?.trim()
    if (configuredExec) {
      calledById = await findUserIdByAgentPhone(supabase, configuredExec)
    }
  }

  if (!calledById) {
    if (initiatedBy) {
      calledById = initiatedBy
    }
  }

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
    .select('id, lead_id, called_by')
    .eq('mcube_call_id', payload.callid)
    .maybeSingle()
  const existingCall = existing as { id: string; lead_id: string; called_by: string } | null

  let leadId: string
  let calledById: string
  let sessionId: string | null
  try {
    const resolved = await resolveLeadAndAgent(supabase, payload)
    leadId = resolved.leadId
    calledById = resolved.calledById
    sessionId = resolved.sessionId
  } catch (e) {
    if (!existingCall) throw e
    leadId = existingCall.lead_id
    calledById = existingCall.called_by
    sessionId = null
  }

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

  if (existingCall) {
    await supabase
      .from('calls')
      .update({
        lead_id: leadId,
        called_by: calledById,
        outcome,
        notes,
        call_duration: durationSec,
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
      } as never)
      .eq('id', existingCall.id)

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
    return { duplicate: true }
  }

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
    console.info('[webhooks/mcube] invalid_payload_raw', JSON.stringify(body))
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
