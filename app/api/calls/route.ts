import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveSLAViolation } from '@/backend/services/sla.service'
import { recalculateLeadScore } from '@/backend/services/scoring.service'
import { z } from 'zod'

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

    const { data, error } = await supabase
      .from('calls')
      .insert({
        lead_id,
        called_by: authResult.user.id,
        outcome,
        disposition,
        notes,
        call_duration,
      })
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

    // Update lead's first_contact_at if this is the first call
    // Check if first_contact_at is null before updating
    const { data: lead } = await supabase
      .from('leads')
      .select('first_contact_at, assigned_to')
      .eq('id', lead_id)
      .single()
    
    if (lead && !lead.first_contact_at) {
      await supabase
        .from('leads')
        .update({
          first_contact_at: new Date().toISOString(),
        })
        .eq('id', lead_id)
      
      // Resolve first_contact SLA violation if it exists
      try {
        await resolveSLAViolation(lead_id, 'first_contact', authResult.user.id)
      } catch (slaError) {
        // Log but don't fail the call creation if SLA resolution fails
        console.error('Failed to resolve SLA violation:', slaError)
      }

      // Recalculate lead score (engagement increased)
      try {
        await recalculateLeadScore(lead_id)
      } catch (scoreError) {
        console.error('Failed to recalculate lead score:', scoreError)
      }
    }

    // Auto-create follow-up for certain call outcomes
    if ((outcome === 'not_reachable' || outcome === 'call_later') && lead?.assigned_to) {
      try {
        const followUpDate = new Date()
        followUpDate.setHours(followUpDate.getHours() + 24) // Default to 24 hours later

        await supabase.from('follow_ups').insert({
          lead_id,
          assigned_to: lead.assigned_to,
          scheduled_at: followUpDate.toISOString(),
          notes: `Auto-scheduled follow-up after call: ${outcome === 'not_reachable' ? 'Not Reachable' : 'Call Later'}`,
          status: 'pending',
        } as any)
      } catch (followUpError) {
        // Log but don't fail the call creation
        console.error('Failed to create automatic follow-up:', followUpError)
      }
    }

    return NextResponse.json({ call: data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
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
