import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getAtRiskLeads } from '@/backend/services/predictive.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const threshold = searchParams.get('threshold') ? parseFloat(searchParams.get('threshold')!) : 50
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50

    const atRiskLeads = await getAtRiskLeads(threshold, limit)

    return NextResponse.json({ leads: atRiskLeads, count: atRiskLeads.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get at-risk leads' },
      { status: 500 }
    )
  }
}
