import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { updateFollowUp, completeFollowUp } from '@/backend/services/followup.service'
import { z } from 'zod'

const updateFollowUpSchema = z.object({
  scheduled_at: z.string().datetime().optional(),
  status: z.enum(['pending', 'done', 'rescheduled', 'no_response']).optional(),
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

    const body = await request.json()
    const updates = updateFollowUpSchema.parse(body)

    const followUp = await updateFollowUp(id, updates)

    return NextResponse.json({ followUp })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update follow-up' },
      { status: 500 }
    )
  }
}

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

    const body = await request.json()
    const { notes } = body

    const followUp = await completeFollowUp(id, notes)

    return NextResponse.json({ followUp })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete follow-up' },
      { status: 500 }
    )
  }
}
