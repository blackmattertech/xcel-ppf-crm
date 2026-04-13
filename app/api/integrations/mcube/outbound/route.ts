import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { triggerMcubeOutbound, resolveMcubeRefurl, formatPhoneForMcubeDial } from '@/backend/services/mcube.service'

const bodySchema = z.object({ lead_id: z.string().uuid() })

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const token = process.env.MCUBE_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'MCUBE is not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const { lead_id } = parsed.data
  const supabase = createServiceClient()

  const { data: leadRow, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, assigned_to')
    .eq('id', lead_id)
    .single()

  if (leadErr || !leadRow) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const lead = leadRow as { id: string; phone: string; assigned_to: string | null }
  const roleName = authResult.user.role?.name
  if (roleName === 'tele_caller' && lead.assigned_to !== authResult.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('phone')
    .eq('id', authResult.user.id)
    .single()

  const agentPhone = (userRow as { phone: string | null } | null)?.phone
  if (!agentPhone?.trim()) {
    return NextResponse.json(
      {
        error:
          'Your profile has no phone number. Set your executive number (same as MCUBE) to place calls.',
      },
      { status: 400 }
    )
  }

  const { data: session, error: se } = await supabase
    .from('mcube_outbound_sessions')
    .insert({
      lead_id,
      initiated_by: authResult.user.id,
    } as never)
    .select('id')
    .single()

  if (se || !session) {
    return NextResponse.json({ error: se?.message ?? 'Failed to create session' }, { status: 500 })
  }

  const sessionId = (session as { id: string }).id
  const forcedExec = process.env.MCUBE_EXECUTIVE_NUMBER?.trim()
  const exenumber = formatPhoneForMcubeDial(forcedExec && forcedExec.length > 0 ? forcedExec : agentPhone)
  const custnumber = formatPhoneForMcubeDial(lead.phone)

  if (custnumber.length < 10) {
    await supabase.from('mcube_outbound_sessions').delete().eq('id', sessionId)
    return NextResponse.json(
      {
        error:
          'Lead has no valid phone number (need at least 10 digits for MCUBE). Update the lead phone and try again.',
      },
      { status: 400 }
    )
  }
  if (exenumber.length < 10) {
    await supabase.from('mcube_outbound_sessions').delete().eq('id', sessionId)
    return NextResponse.json(
      {
        error:
          'Executive number sent to MCUBE is invalid (need 10 digits). Set your user phone in profile or configure MCUBE_EXECUTIVE_NUMBER.',
      },
      { status: 400 }
    )
  }

  const result = await triggerMcubeOutbound({
    token,
    exenumber,
    custnumber,
    refid: sessionId,
    refurl: resolveMcubeRefurl(),
  })

  // Debug aid: confirms what we sent to MCUBE for callback correlation.
  console.info('[mcube/outbound]', {
    lead_id,
    sessionId,
    exenumber,
    custnumber,
    ok: result.ok,
    httpStatus: result.status,
  })

  if (!result.ok) {
    await supabase.from('mcube_outbound_sessions').delete().eq('id', sessionId)
    let userMessage = 'MCUBE outbound request failed'
    try {
      const j = JSON.parse(result.body) as { msg?: string; message?: string; status?: string }
      if (j.msg || j.message) {
        userMessage = String(j.msg || j.message)
      }
    } catch {
      if (result.body && result.body.length < 200) {
        userMessage = result.body
      }
    }
    return NextResponse.json(
      { error: userMessage, detail: result.body, httpStatus: result.status },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, session_id: sessionId })
}
