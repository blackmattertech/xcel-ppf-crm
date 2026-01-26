import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { processAutomaticRecycling } from '@/backend/services/recycle.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const recycledCount = await processAutomaticRecycling()

    return NextResponse.json({
      message: 'Recycle processing completed',
      recycled: recycledCount,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process recycling' },
      { status: 500 }
    )
  }
}
