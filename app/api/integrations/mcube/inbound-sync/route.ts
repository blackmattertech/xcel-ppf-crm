import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import {
  fetchMcubeInboundCallsByPhone,
  mapDialStatusToOutcome,
  parseAnsweredTimeToSeconds,
  parseMcubeTimestamp,
  findUserIdByAgentPhone,
  getMcubeManualMergeCreatedAtBounds,
  findRecentManualCallToEnrichWithMcube,
  mergeMcubeDetailIntoManualNotes,
  type McubeWebhookPayload,
} from '@/backend/services/mcube.service'

const bodySchema = z.object({ lead_id: z.string().uuid() })

async function upsertCallFromMcubePayload(params: {
  supabase: ReturnType<typeof createServiceClient>
  leadId: string
  fallbackCalledBy: string
  payload: McubeWebhookPayload
}): Promise<boolean> {
  const { supabase, leadId, fallbackCalledBy, payload } = params
  const calledBy = (await findUserIdByAgentPhone(supabase, payload.emp_phone ?? null)) || fallbackCalledBy
  if (!calledBy) return false

  const outcome = mapDialStatusToOutcome(payload.dialstatus ?? null)
  const duration = parseAnsweredTimeToSeconds(payload.answeredtime ?? null)
  const direction =
    payload.direction && ['inbound', 'outbound'].includes(payload.direction.toLowerCase())
      ? (payload.direction.toLowerCase() as 'inbound' | 'outbound')
      : null

  const { data: existing } = await supabase
    .from('calls')
    .select('id')
    .eq('mcube_call_id', payload.callid)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('calls')
      .update({
        recording_url: payload.filename?.trim() || null,
        started_at: parseMcubeTimestamp(payload.starttime ?? null),
        ended_at: parseMcubeTimestamp(payload.endtime ?? null),
        answered_duration_seconds: duration,
        dial_status: payload.dialstatus ?? null,
        direction,
        disconnected_by: payload.disconnectedby?.trim() || null,
        mcube_group_name: payload.groupname?.trim() || null,
        mcube_agent_name: payload.agentname?.trim() || null,
      } as never)
      .eq('mcube_call_id', payload.callid)
    return true
  }

  const { fromIso, toIso } = getMcubeManualMergeCreatedAtBounds({
    endtime: payload.endtime,
    starttime: payload.starttime,
  })
  const manualCall = await findRecentManualCallToEnrichWithMcube(supabase, {
    leadId,
    calledById: calledBy,
    createdAtFromInclusive: fromIso,
    createdAtToInclusive: toIso,
  })

  if (manualCall) {
    const inboundLine = 'MCUBE inbound sync'
    const mergedNotes = mergeMcubeDetailIntoManualNotes(manualCall.notes, inboundLine)
    const { error: enrichError } = await supabase
      .from('calls')
      .update({
        outcome: manualCall.outcome,
        notes: mergedNotes,
        disposition: manualCall.disposition,
        call_duration: duration,
        mcube_call_id: payload.callid,
        recording_url: payload.filename?.trim() || null,
        started_at: parseMcubeTimestamp(payload.starttime ?? null),
        ended_at: parseMcubeTimestamp(payload.endtime ?? null),
        answered_duration_seconds: duration,
        dial_status: payload.dialstatus ?? null,
        direction,
        disconnected_by: payload.disconnectedby?.trim() || null,
        mcube_group_name: payload.groupname?.trim() || null,
        mcube_agent_name: payload.agentname?.trim() || null,
        integration: 'mcube',
      } as never)
      .eq('id', manualCall.id)

    return !enrichError
  }

  const { error } = await supabase.from('calls').insert({
    lead_id: leadId,
    called_by: calledBy,
    outcome,
    notes: 'MCUBE inbound sync',
    call_duration: duration,
    mcube_call_id: payload.callid,
    recording_url: payload.filename?.trim() || null,
    started_at: parseMcubeTimestamp(payload.starttime ?? null),
    ended_at: parseMcubeTimestamp(payload.endtime ?? null),
    answered_duration_seconds: duration,
    dial_status: payload.dialstatus ?? null,
    direction,
    disconnected_by: payload.disconnectedby?.trim() || null,
    mcube_group_name: payload.groupname?.trim() || null,
    mcube_agent_name: payload.agentname?.trim() || null,
    integration: 'mcube',
    disposition: null,
  } as never)

  return !error
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if ('error' in auth) return auth.error

    const token = process.env.MCUBE_API_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'MCUBE is not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const leadId = parsed.data.lead_id
    const supabase = createServiceClient()
    const { data: leadData, error: leadErr } = await supabase
      .from('leads')
      .select('id, phone, assigned_to')
      .eq('id', leadId)
      .single()

    if (leadErr || !leadData) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const lead = leadData as { id: string; phone: string; assigned_to: string | null }
    if (auth.user.role?.name === 'tele_caller' && lead.assigned_to !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const calls = await fetchMcubeInboundCallsByPhone({ token, phone: lead.phone })
    console.info(
      '[mcube/inbound-sync] fetched_calls',
      JSON.stringify({
        leadId,
        leadPhone: lead.phone,
        total: calls.length,
        calls,
      })
    )
    if (!calls.length) {
      return NextResponse.json({ synced: 0, totalFetched: 0 })
    }

    let synced = 0
    for (const item of calls) {
      const ok = await upsertCallFromMcubePayload({
        supabase,
        leadId,
        fallbackCalledBy: lead.assigned_to || auth.user.id,
        payload: item,
      })
      if (ok) synced += 1
    }

    return NextResponse.json({ synced, totalFetched: calls.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Inbound sync failed' },
      { status: 500 }
    )
  }
}

