import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { convertLeadToCustomer, createOrderFromLead } from '@/backend/services/conversion.service'
import { updateLeadStatus } from '@/backend/services/lead-journey.service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'
import { z } from 'zod'

const convertSchema = z.object({
  assigned_team: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    // First, update lead status to converted
    await updateLeadStatus(params.id, LEAD_STATUS.CONVERTED, authResult.user.id)

    // Convert lead to customer
    const customer = await convertLeadToCustomer(params.id)

    // Create order
    const body = await request.json().catch(() => ({}))
    const { assigned_team } = convertSchema.parse(body)
    const order = await createOrderFromLead(params.id, customer.id, assigned_team)

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
