import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { deleteFollowUpsByIds } from '@/backend/services/followup.service'
import { isAssignedOnlyFollowUpsRole } from '@/shared/constants/roles'
import { z } from 'zod'

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one id required'),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const body = await request.json()
    const { ids } = bodySchema.parse(body)
    const userId = authResult.user.id
    const userRole = authResult.user.role.name

    const allowedAssignedTo = isAssignedOnlyFollowUpsRole(userRole) ? userId : null
    const { deletedCount } = await deleteFollowUpsByIds(ids, allowedAssignedTo)
    return NextResponse.json({ success: true, deletedCount })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete follow-ups' },
      { status: 500 }
    )
  }
}
