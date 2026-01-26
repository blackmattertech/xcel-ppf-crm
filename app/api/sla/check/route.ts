import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { checkAllSLAViolations, processAutomaticEscalation } from '@/backend/services/sla.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    // Check for new violations
    const violationsCount = await checkAllSLAViolations()
    
    // Process automatic escalations
    await processAutomaticEscalation()

    return NextResponse.json({ 
      message: 'SLA check completed',
      violationsFound: violationsCount
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check SLA violations' },
      { status: 500 }
    )
  }
}
