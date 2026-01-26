import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { processPendingNurtureSteps, autoEnrollLeadsInTriggerCampaigns } from '@/backend/services/nurturing.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.NURTURE_MANAGE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    // Auto-enroll leads in trigger campaigns
    const enrolledCount = await autoEnrollLeadsInTriggerCampaigns()

    // Process pending steps
    const processedCount = await processPendingNurtureSteps()

    return NextResponse.json({
      message: 'Nurture processing completed',
      enrolled: enrolledCount,
      processed: processedCount,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process nurture campaigns' },
      { status: 500 }
    )
  }
}
