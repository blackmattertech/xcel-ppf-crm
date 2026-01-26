import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { updateLeadStatus } from '@/backend/services/lead-journey.service'
import { z } from 'zod'
import { LEAD_STATUS } from '@/shared/constants/lead-status'

const updateStatusSchema = z.object({
  status: z.enum([
    LEAD_STATUS.NEW,
    LEAD_STATUS.QUALIFIED,
    LEAD_STATUS.UNQUALIFIED,
    LEAD_STATUS.QUOTATION_SHARED,
    LEAD_STATUS.QUOTATION_VIEWED,
    LEAD_STATUS.QUOTATION_ACCEPTED,
    LEAD_STATUS.QUOTATION_EXPIRED,
    LEAD_STATUS.INTERESTED,
    LEAD_STATUS.NEGOTIATION,
    LEAD_STATUS.LOST,
    LEAD_STATUS.DISCARDED,
    LEAD_STATUS.CONVERTED,
    LEAD_STATUS.DEAL_WON,
    LEAD_STATUS.PAYMENT_PENDING,
    LEAD_STATUS.ADVANCE_RECEIVED,
    LEAD_STATUS.FULLY_PAID,
  ]),
  notes: z.string().nullable().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name
    const userId = user.id

    // For tele_callers, verify they can only update their assigned leads
    if (userRole === 'tele_caller') {
      const { getLeadById } = await import('@/backend/services/lead.service')
      try {
        const lead = await getLeadById(id, userId, userRole)
        if ((lead as any).assigned_to !== userId) {
          return NextResponse.json(
            { error: 'Forbidden: You can only update leads assigned to you' },
            { status: 403 }
          )
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Lead not found'
        if (errorMessage.includes('Forbidden') || errorMessage.includes('not found')) {
          return NextResponse.json(
            { error: errorMessage },
            { status: errorMessage.includes('Forbidden') ? 403 : 404 }
          )
        }
        throw error
      }
    }

    const body = await request.json()
    const { status, notes } = updateStatusSchema.parse(body)

    const lead = await updateLeadStatus(id, status, userId, notes)

    return NextResponse.json({ lead })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to update lead status'
    const status = errorMessage.includes('Forbidden') ? 403 : 
                   errorMessage.includes('not found') ? 404 : 500
    return NextResponse.json(
      { error: errorMessage },
      { status }
    )
  }
}
