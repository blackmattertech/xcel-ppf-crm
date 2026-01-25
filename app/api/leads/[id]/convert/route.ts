import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { convertLeadToCustomer, createOrderFromLead } from '@/backend/services/conversion.service'
import { updateLeadStatus } from '@/backend/services/lead-journey.service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const convertSchema = z.object({
  assigned_team: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    // Get current lead status
    const supabase = createServiceClient()
    const { data: lead } = await supabase
      .from('leads')
      .select('status')
      .eq('id', id)
      .single()

    // Only update to CONVERTED if not already in a convertible status
    const convertibleStatuses = [
      LEAD_STATUS.CONVERTED,
      LEAD_STATUS.FULLY_PAID,
      LEAD_STATUS.DEAL_WON,
      LEAD_STATUS.PAYMENT_PENDING,
      LEAD_STATUS.ADVANCE_RECEIVED,
    ]

    if (lead && !convertibleStatuses.includes(lead.status as any)) {
      // Update lead status to converted if needed
      await updateLeadStatus(id, LEAD_STATUS.CONVERTED, authResult.user.id)
    }

    // Convert lead to customer
    const customer = await convertLeadToCustomer(id)

    // Create order
    const body = await request.json().catch(() => ({}))
    const { assigned_team } = convertSchema.parse(body)
    const order = await createOrderFromLead(id, customer.id, assigned_team)

    return NextResponse.json({
      customer,
      order,
      message: 'Lead converted to customer successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to convert lead' },
      { status: 500 }
    )
  }
}
