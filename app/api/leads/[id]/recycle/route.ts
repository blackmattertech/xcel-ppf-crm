import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { recycleLead } from '@/backend/services/recycle.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const recycleSchema = z.object({
  newStatus: z.string().optional(),
  notes: z.string().optional(),
})

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
    const { newStatus, notes } = recycleSchema.parse(body)

    await recycleLead(id, authResult.user.id, newStatus || 'new', notes)

    return NextResponse.json({ message: 'Lead recycled successfully' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recycle lead' },
      { status: 500 }
    )
  }
}
