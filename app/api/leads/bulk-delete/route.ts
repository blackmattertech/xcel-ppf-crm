import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { deleteLead } from '@/backend/services/lead.service'
import { invalidateLeadCaches } from '@/lib/cache-invalidation'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { z } from 'zod'

const bulkDeleteSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1, 'At least one lead ID is required'),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_DELETE)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name

    // Only admin and super_admin can bulk delete leads
    if (userRole !== SYSTEM_ROLES.ADMIN && userRole !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can bulk delete leads' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { lead_ids } = bulkDeleteSchema.parse(body)

    const results = {
      success: [] as string[],
      failed: [] as Array<{ lead_id: string; error: string }>,
    }

    for (const id of lead_ids) {
      try {
        await deleteLead(id)
        await invalidateLeadCaches(id, true)
        results.success.push(id)
      } catch (err) {
        results.failed.push({
          lead_id: id,
          error: err instanceof Error ? err.message : 'Failed to delete lead',
        })
      }
    }

    return NextResponse.json({
      message: `Successfully deleted ${results.success.length} lead(s)`,
      success: results.success.length,
      failed: results.failed.length,
      results,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to bulk delete leads' },
      { status: 500 }
    )
  }
}
