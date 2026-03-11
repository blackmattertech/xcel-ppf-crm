import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getLeadCountsByStatus } from '@/backend/services/lead.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    if ('error' in authResult) {
      return authResult.error
    }
    const { user } = authResult
    const userRole = user.role?.name
    const userId = user.id

    const counts = await getLeadCountsByStatus({
      userId: userRole === 'tele_caller' ? userId : undefined,
      userRole: userRole ?? undefined,
    })
    return NextResponse.json({ counts })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch pipeline counts' },
      { status: 500 }
    )
  }
}
