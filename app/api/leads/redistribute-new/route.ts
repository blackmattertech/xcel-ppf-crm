import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { redistributeNewLeadsAmongTeleCallers } from '@/backend/services/assignment.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

/**
 * POST /api/leads/redistribute-new
 * Redistribute NEW leads among tele_callers (unassigned and those assigned to non-tele_callers).
 * Use after deleting the only tele_caller and adding a new one, to assign those leads to the new tele_caller.
 * Requires leads.manage or admin.
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
