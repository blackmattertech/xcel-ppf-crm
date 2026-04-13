import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { redistributeNewLeadsAmongTeleCallers } from '@/backend/services/assignment.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

/**
 * POST /api/leads/redistribute-new
 * Assigns unassigned NEW leads and NEW leads on non-sales roles to users who are in the auto-assignment pool
 * (tele_caller/sales with receives_new_lead_assignments). Does not move leads already owned by a rep.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_MANAGE)

    if ('error' in authResult) {
      return authResult.error
    }

    const count = await redistributeNewLeadsAmongTeleCallers(authResult.user.id)
    return NextResponse.json({ reassigned: count })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to redistribute leads' },
      { status: 500 }
    )
  }
}
