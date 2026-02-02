import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { enrollLeadInCampaign } from '@/backend/services/nurturing.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const enrollSchema = z.object({
  campaignId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.NURTURE_CREATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { campaignId } = enrollSchema.parse(body)

    const enrollment = await enrollLeadInCampaign(id, campaignId)

    return NextResponse.json({ enrollment }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enroll lead' },
      { status: 500 }
    )
  }
}
