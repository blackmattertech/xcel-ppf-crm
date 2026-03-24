import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache'
import { logRouteTiming } from '@/lib/route-timing'
type AnalyticsDashboard = {
  leadsBySource: Record<string, number>
  leadsByStatus: Record<string, number>
  conversionRate: number
  repPerformance: Array<{
    user_id: string
    user_name: string
    total_leads: number
    converted_leads: number
    conversion_rate: number
  }>
  followUpCompliance: number
  slaBreaches: number
  leadsOverTime: Array<{ date: string; leads: number; converted: number }>
  leadsInterestedByProduct: Array<{
    product_name: string
    product_id: string
    leads_count: number
  }>
  convertedLeadsByProduct: Array<{
    product_name: string
    product_id: string
    leads_count: number
  }>
}

export async function GET(request: NextRequest) {
  const t0 = performance.now()
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()
    
    // Check if tables exist, return empty data if not
    const { error: tableCheck } = await supabase.from('leads').select('id').limit(1)
    if (tableCheck && tableCheck.code === '42P01') {
      // Table doesn't exist - return empty analytics
      return NextResponse.json({
        leadsBySource: {},
        leadsByStatus: {},
        conversionRate: 0,
        repPerformance: [],
        followUpCompliance: 0,
        slaBreaches: 0,
        leadsOverTime: [],
        leadsInterestedByProduct: [],
        convertedLeadsByProduct: [],
        period: {
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        },
      })
    }
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    // Check cache first
    const cacheKey = `${CACHE_KEYS.ANALYTICS}:${startDate}:${endDate}`
    const cached = await getCache(cacheKey)
    if (cached) {
      logRouteTiming('GET /api/analytics cache', t0, { cached: true })
      return NextResponse.json(cached)
    }

    const { data: dashboard, error: dashboardError } = await (
      supabase as unknown as {
        rpc: (
          name: 'get_analytics_dashboard',
          args: { p_start: string; p_end: string }
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      }
    ).rpc('get_analytics_dashboard', { p_start: startDate, p_end: endDate })

    if (dashboardError) {
      throw new Error(dashboardError.message)
    }

    const d = dashboard as AnalyticsDashboard

    const result = {
      leadsBySource: d.leadsBySource ?? {},
      leadsByStatus: d.leadsByStatus ?? {},
      conversionRate: d.conversionRate ?? 0,
      repPerformance: d.repPerformance ?? [],
      followUpCompliance: Math.round(
        Math.min(100, Math.max(0, Number(d.followUpCompliance) || 0)) * 100
      ) / 100,
      slaBreaches: d.slaBreaches ?? 0,
      leadsOverTime: d.leadsOverTime ?? [],
      leadsInterestedByProduct: d.leadsInterestedByProduct ?? [],
      convertedLeadsByProduct: d.convertedLeadsByProduct ?? [],
      period: {
        startDate,
        endDate,
      },
    }

    // Cache result for 60 seconds (analytics data changes frequently)
    await setCache(cacheKey, result, CACHE_TTL.MEDIUM)

    logRouteTiming('GET /api/analytics', t0, result)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
