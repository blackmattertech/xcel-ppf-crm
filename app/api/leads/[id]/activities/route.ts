import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getLeadActivities, getLeadActivitySummary, createLeadActivity } from '@/backend/services/activity.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const createActivitySchema = z.object({
  activityType: z.enum([
    'call',
    'email',
    'sms',
    'whatsapp',
    'meeting',
    'note',
    'status_change',
    'assignment',
    'followup_created',
    'followup_completed',
    'quotation_sent',
    'quotation_viewed',
    'quotation_accepted',
    'file_uploaded',
    'custom',
  ]),
  activitySubtype: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().uuid().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const summary = searchParams.get('summary') === 'true'

    if (summary) {
      const activitySummary = await getLeadActivitySummary(id)
      return NextResponse.json({ summary: activitySummary })
    }

    const filters = {
      activityType: searchParams.get('activityType') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    }

    const activities = await getLeadActivities(id, filters)
    return NextResponse.json({ activities })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch activities' },
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
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const activityData = createActivitySchema.parse(body)

    const activity = await createLeadActivity({
      leadId: id,
      ...activityData,
      performedBy: authResult.user.id,
    })

    return NextResponse.json({ activity }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create activity' },
      { status: 500 }
    )
  }
}
