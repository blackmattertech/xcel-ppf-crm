import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { applyLeadJourneyAfterCall } from '@/backend/services/call-lead-journey.service'
import { mergeMcubeDetailIntoManualNotes } from '@/backend/services/mcube.service'
import { z } from 'zod'

/** Webhook may insert the MCUBE row before the agent submits the CRM call modal — enrich that row instead of duplicating. */
const RECENT_MCUBE_CALL_ENRICH_WINDOW_MS = 8 * 60 * 1000

const createCallSchema = z.object({
  lead_id: z.string().uuid(),
  outcome: z.enum(['connected', 'not_reachable', 'wrong_number', 'call_later']),
  disposition: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  call_duration: z.number().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { lead_id, outcome, disposition, notes, call_duration } = createCallSchema.parse(body)

    const supabase = createServiceClient()

    const { data: latestCall } = await supabase
      .from('calls')
      .select('id, mcube_call_id, integration, created_at, outcome, notes')
      .eq('lead_id', lead_id)
      .eq('called_by', authResult.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latest = latestCall as {
      id: string
      mcube_call_id: string | null
      integration: string
      created_at: string
      outcome: string
      notes: string | null
    } | null

    const shouldEnrichRecentMcube =
      latest?.mcube_call_id &&
      latest.integration === 'mcube' &&
      latest.outcome === outcome &&
      Date.now() - new Date(latest.created_at).getTime() < RECENT_MCUBE_CALL_ENRICH_WINDOW_MS

    if (shouldEnrichRecentMcube) {
      const userNotes = typeof notes === 'string' ? notes.trim() : ''
      const mergedNotes = userNotes
        ? mergeMcubeDetailIntoManualNotes(latest.notes, userNotes)
        : latest.notes

      const { data, error } = await supabase
        .from('calls')
        .update({
          disposition: disposition ?? null,
          notes: mergedNotes ?? null,
          call_duration: call_duration ?? null,
        } as never)
        .eq('id', latest.id)
        .select(`
        *,
        called_by_user:users!calls_called_by_fkey (
          id,
          name
        ),
        lead:leads (
          id,
          name,
          phone
        )
      `)
        .single()

      if (error) {
        throw new Error(`Failed to update call: ${error.message}`)
      }

      return NextResponse.json({ call: data }, { status: 200 })
    }

    const { data, error } = await supabase
      .from('calls')
      .insert({
        lead_id,
        called_by: authResult.user.id,
        outcome,
        disposition,
        notes,
        call_duration,
      } as any)
      .select(`
        *,
        called_by_user:users!calls_called_by_fkey (
          id,
          name
        ),
        lead:leads (
          id,
          name,
          phone
        )
      `)
      .single()

    if (error) {
      throw new Error(`Failed to create call: ${error.message}`)
    }

    await applyLeadJourneyAfterCall({
      leadId: lead_id,
      outcome,
      changedByUserId: authResult.user.id,
    })

    return NextResponse.json({ call: data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create call' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const leadId = searchParams.get('lead_id')
    const userId = searchParams.get('user_id')

    const supabase = createServiceClient()

    let query = supabase
      .from('calls')
      .select(`
        *,
        called_by_user:users!calls_called_by_fkey (
          id,
          name
        ),
        lead:leads (
          id,
          name,
          phone
        )
      `)
      .order('created_at', { ascending: false })

    if (leadId) {
      query = query.eq('lead_id', leadId)
    }
    
    if (userId) {
      query = query.eq('called_by', userId)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch calls: ${error.message}`)
    }

    return NextResponse.json({ calls: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch calls' },
      { status: 500 }
    )
  }
}
