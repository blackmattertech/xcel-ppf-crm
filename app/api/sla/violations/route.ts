import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getActiveSLAViolations, resolveSLAViolation } from '@/backend/services/sla.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const resolveViolationSchema = z.object({
  violationId: z.string().uuid(),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const filters = {
      leadId: searchParams.get('leadId') || undefined,
      violationType: searchParams.get('violationType') || undefined,
      escalationLevel: searchParams.get('escalationLevel') ? parseInt(searchParams.get('escalationLevel')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    }

    const violations = await getActiveSLAViolations(filters)
    return NextResponse.json({ violations })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch SLA violations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { violationId, notes } = resolveViolationSchema.parse(body)

    await resolveSLAViolation(violationId, authResult.user.id, notes)

    return NextResponse.json({ message: 'SLA violation resolved successfully' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve SLA violation' },
      { status: 500 }
    )
  }
}
