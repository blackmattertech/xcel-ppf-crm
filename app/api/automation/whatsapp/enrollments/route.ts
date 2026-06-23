import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { canEnrollAutomation, canReadAutomation } from '@/backend/services/whatsapp-automation-auth'
import {
  cancelEnrollment,
  enrollLead,
  getEnrollmentsForLead,
} from '@/backend/services/whatsapp-automation.service'
import { z } from 'zod'

const enrollSchema = z.object({
  flow_id: z.string().uuid(),
  lead_id: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canReadAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const leadId = new URL(request.url).searchParams.get('leadId')
    if (!leadId) {
      return NextResponse.json({ error: 'leadId query param required' }, { status: 400 })
    }

    const enrollments = await getEnrollmentsForLead(leadId)
    return NextResponse.json({ enrollments })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch enrollments' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canEnrollAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validated = enrollSchema.parse(body)
    const enrollment = await enrollLead(
      validated.flow_id,
      validated.lead_id,
      user.id,
      user.role?.name
    )
    return NextResponse.json(enrollment, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    const statusCode = (error as Error & { statusCode?: number }).statusCode
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enroll' },
      { status: statusCode === 409 ? 409 : error instanceof Error && error.message.startsWith('Forbidden') ? 403 : 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canEnrollAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const enrollmentId = new URL(request.url).searchParams.get('enrollmentId')
    if (!enrollmentId) {
      return NextResponse.json({ error: 'enrollmentId query param required' }, { status: 400 })
    }

    await cancelEnrollment(enrollmentId, user.id, user.role?.name)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel enrollment' },
      { status: error instanceof Error && error.message.startsWith('Forbidden') ? 403 : 500 }
    )
  }
}
