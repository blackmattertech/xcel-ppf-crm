import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createFollowUp, getFollowUps } from '@/backend/services/followup.service'
import { isAssignedOnlyFollowUpsRole } from '@/shared/constants/roles'
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

    // Send push notification to assigned user (no-op if FCM not configured or no tokens)
    try {
      const lead = (followUp as any)?.lead
      await sendFollowUpAssignedNotification(followUpData.assigned_to, {
        leadName: lead?.name ?? undefined,
        scheduledAt: followUpData.scheduled_at,
        followUpId: (followUp as any).id,
        leadId: followUpData.lead_id,
      })
    } catch (_) {
      // Don't fail the request if push fails
    }

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

    const userId = authResult.user.id
    const userRole = authResult.user.role.name

    const searchParams = request.nextUrl.searchParams
    const filters: {
      assignedTo?: string
      leadId?: string
      status?: string
      scheduledBefore?: string
      scheduledAfter?: string
    } = {
      assignedTo: searchParams.get('assignedTo') || undefined,
      leadId: searchParams.get('leadId') || undefined,
      status: searchParams.get('status') || undefined,
      scheduledBefore: searchParams.get('scheduledBefore') || undefined,
      scheduledAfter: searchParams.get('scheduledAfter') || undefined,
    }

    // Tele-callers and sales roles only see follow-ups assigned to them
    if (isAssignedOnlyFollowUpsRole(userRole)) {
      filters.assignedTo = userId
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
