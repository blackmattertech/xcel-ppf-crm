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
    LEAD_STATUS.INTERESTED,
    LEAD_STATUS.NEGOTIATION,
    LEAD_STATUS.LOST,
    LEAD_STATUS.CONVERTED,
  ]),
  notes: z.string().nullable().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { id } = await params
    const body = await request.json()
    const { status, notes } = updateStatusSchema.parse(body)

    const lead = await updateLeadStatus(id, status, authResult.user.id, notes || undefined)

    return NextResponse.json({ lead })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update lead status' },
      { status: 500 }
    )
  }
}
