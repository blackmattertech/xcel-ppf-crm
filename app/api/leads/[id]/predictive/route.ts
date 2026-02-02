import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getLeadPredictiveInsights } from '@/backend/services/predictive.service'
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

    const insights = await getLeadPredictiveInsights(id)

    return NextResponse.json({ insights })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get predictive insights' },
      { status: 500 }
    )
  }
}
