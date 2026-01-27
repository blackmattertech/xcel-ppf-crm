import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

interface CallInsert {
  lead_id: string
  called_by: string
  outcome: 'connected' | 'not_reachable' | 'wrong_number' | 'call_later'
  disposition: string | null
  notes: string | null
  call_duration: number | null
}

interface LeadFirstContactRow {
  first_contact_at: string | null
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

    const callInsertData = {
      lead_id,
      called_by: authResult.user.id,
      outcome,
      disposition: disposition || null,
      notes: notes || null,
      call_duration: call_duration || null,
    }

    const { data, error } = await supabase
      .from('calls')
      .insert(callInsertData as any)
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
      .select('first_contact_at')
      .eq('id', lead_id)
      .single<LeadFirstContactRow>()
    
    if (lead && !lead.first_contact_at) {
      // Update lead's first_contact_at - using type assertion due to incomplete Supabase types
      const updateQuery = supabase.from('leads').update({ first_contact_at: new Date().toISOString() } as never)
      await (updateQuery as any).eq('id', lead_id)
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
