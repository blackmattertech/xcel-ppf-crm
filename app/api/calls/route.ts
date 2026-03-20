import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'
import { z } from 'zod'

interface CallInsert {
  lead_id: string
  called_by: string
  outcome: 'connected' | 'not_reachable' | 'wrong_number' | 'call_later'
  disposition?: string | null
  notes?: string | null
  call_duration?: number | null
}

interface LeadQueryRow {
  first_contact_at: string | null
  assigned_to: string | null
  status: string
}

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

    // Get current lead status and first_contact_at
    const { data: leadData } = await supabase
      .from('leads')
      .select('first_contact_at, assigned_to, status')
      .eq('id', lead_id)
      .single()
    
    const lead = leadData as LeadQueryRow | null
    
    if (!lead) {
      throw new Error('Lead not found')
    }

    const isFirstCall = !lead.first_contact_at
    const updates: Record<string, any> = {}

    // LEAD JOURNEY: Update first_contact_at on first call attempt
    if (isFirstCall) {
      updates.first_contact_at = new Date().toISOString()
    }

    // LEAD JOURNEY: Status transitions based on call outcome
    if (outcome === 'wrong_number') {
      // Wrong Number → Discarded (Lost)
      updates.status = LEAD_STATUS.LOST
      // Also log in status history
      await supabase.from('lead_status_history').insert({
        lead_id,
        old_status: lead.status,
        new_status: LEAD_STATUS.LOST,
        changed_by: authResult.user.id,
        notes: 'Marked as lost due to wrong number',
      } as any)
    } else if (isFirstCall && lead.status === LEAD_STATUS.NEW) {
      // First call attempt: New → Contacted
      updates.status = LEAD_STATUS.CONTACTED
      // Log status change
      await supabase.from('lead_status_history').insert({
        lead_id,
        old_status: LEAD_STATUS.NEW,
        new_status: LEAD_STATUS.CONTACTED,
        changed_by: authResult.user.id,
        notes: 'First call attempt made',
      } as any)
    } else if ((outcome === 'not_reachable' || outcome === 'call_later') && lead.status === LEAD_STATUS.NEW) {
      // Not Reachable / Call Later on new lead → Contacted
      updates.status = LEAD_STATUS.CONTACTED
      await supabase.from('lead_status_history').insert({
        lead_id,
        old_status: LEAD_STATUS.NEW,
        new_status: LEAD_STATUS.CONTACTED,
        changed_by: authResult.user.id,
        notes: `Status updated to contacted: ${outcome === 'not_reachable' ? 'Not Reachable' : 'Call Later'}`,
      } as any)
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('leads')
        // @ts-ignore - Supabase type inference issue with dynamic updates
        .update(updates)
        .eq('id', lead_id)
    }

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
