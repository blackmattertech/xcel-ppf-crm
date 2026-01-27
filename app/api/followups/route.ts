import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createFollowUp, getFollowUps } from '@/backend/services/followup.service'
import { z } from 'zod'

const createFollowUpSchema = z.object({
  lead_id: z.string().uuid(),
  assigned_to: z.string().uuid(),
  scheduled_at: z.string().datetime(),
  notes: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const followUpData = createFollowUpSchema.parse(body)

    const followUp = await createFollowUp(followUpData)

    return NextResponse.json({ followUp }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create follow-up' },
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
    const filters = {
      assignedTo: searchParams.get('assignedTo') || undefined,
      leadId: searchParams.get('leadId') || undefined,
      status: searchParams.get('status') || undefined,
      scheduledBefore: searchParams.get('scheduledBefore') || undefined,
      scheduledAfter: searchParams.get('scheduledAfter') || undefined,
    }

    const followUps = await getFollowUps(filters)
    return NextResponse.json({ followUps })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch follow-ups' },
      { status: 500 }
    )
  }
}
