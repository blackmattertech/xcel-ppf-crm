import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { fetchAnalyticsDashboardPayload } from '@/lib/server/dashboard-payload'
import { logRouteTiming } from '@/lib/route-timing'

export async function GET(request: NextRequest) {
  const t0 = performance.now()
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const startDate =
      searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    const { payload, cacheHit } = await fetchAnalyticsDashboardPayload(startDate, endDate)

    logRouteTiming(
      cacheHit ? 'GET /api/analytics cache' : 'GET /api/analytics',
      t0,
      cacheHit ? { cached: true } : payload
    )

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
