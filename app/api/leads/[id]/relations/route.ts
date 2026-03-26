import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getLeadRelations } from '@/backend/services/lead.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

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

    const { user } = authResult
    const userRole = user.role.name
    const userId = user.id

    const data = await getLeadRelations(id, userId, userRole)
    const rel = data as {
      status_history?: unknown
      calls?: unknown
      follow_ups?: unknown
      lead_notes?: unknown
    }
    return NextResponse.json({
      relations: {
        status_history: rel.status_history ?? [],
        calls: rel.calls ?? [],
        follow_ups: rel.follow_ups ?? [],
        lead_notes: rel.lead_notes ?? [],
      },
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch lead relations'
    const status = errorMessage.includes('Forbidden')
      ? 403
      : errorMessage.includes('not found')
        ? 404
        : 500
    return NextResponse.json({ error: errorMessage }, { status })
  }
}
