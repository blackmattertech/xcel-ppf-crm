import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { canReadAutomation } from '@/backend/services/whatsapp-automation-auth'
import { getAutomationAnalytics } from '@/backend/services/whatsapp-automation-analytics.service'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canReadAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const flowId = searchParams.get('flowId')
    if (!flowId) {
      return NextResponse.json({ error: 'flowId query param required' }, { status: 400 })
    }

    const startDate = searchParams.get('startDate') ?? undefined
    const endDate = searchParams.get('endDate') ?? undefined

    const analytics = await getAutomationAnalytics({ flowId, startDate, endDate })
    if (!analytics) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
    }

    return NextResponse.json(analytics)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
