import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { enrichLead } from '@/backend/services/integrations/enrichment-api.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

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

    const enrichment = await enrichLead(id)

    return NextResponse.json({ enrichment })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enrich lead' },
      { status: 500 }
    )
  }
}
