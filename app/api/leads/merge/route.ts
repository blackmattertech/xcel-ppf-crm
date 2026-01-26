import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { mergeDuplicateLeads } from '@/backend/services/duplicate-detection.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const mergeLeadsSchema = z.object({
  masterLeadId: z.string().uuid(),
  duplicateLeadId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { masterLeadId, duplicateLeadId } = mergeLeadsSchema.parse(body)

    if (masterLeadId === duplicateLeadId) {
      return NextResponse.json(
        { error: 'Master and duplicate lead IDs cannot be the same' },
        { status: 400 }
      )
    }

    const mergedLead = await mergeDuplicateLeads(
      masterLeadId,
      duplicateLeadId,
      authResult.user.id
    )

    return NextResponse.json({ 
      message: 'Leads merged successfully',
      lead: mergedLead
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to merge leads' },
      { status: 500 }
    )
  }
}
