import { createServiceClient } from '@/lib/supabase/service'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache'
import { getProductsWithStats, type ProductWithStats } from '@/backend/services/product.service'
type AnalyticsDashboardRpc = {
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

export type AnalyticsDashboardPayload = {
  leadsBySource: Record<string, number>
  leadsByStatus: Record<string, number>
  conversionRate: number
  repPerformance: AnalyticsDashboardRpc['repPerformance']
  followUpCompliance: number
  slaBreaches: number
  leadsOverTime: AnalyticsDashboardRpc['leadsOverTime']
  leadsInterestedByProduct: AnalyticsDashboardRpc['leadsInterestedByProduct']
  convertedLeadsByProduct: AnalyticsDashboardRpc['convertedLeadsByProduct']
  period: { startDate: string; endDate: string }
}

function emptyAnalyticsPayload(startDate: string, endDate: string): AnalyticsDashboardPayload {
  return {
    leadsBySource: {},
    leadsByStatus: {},
    conversionRate: 0,
    repPerformance: [],
    followUpCompliance: 0,
    slaBreaches: 0,
    leadsOverTime: [],
    leadsInterestedByProduct: [],
    convertedLeadsByProduct: [],
    period: { startDate, endDate },
  }
}

/**
 * Analytics JSON for dashboard / GET /api/analytics. Redis-cached by date range.
 */
export async function fetchAnalyticsDashboardPayload(
  startDate: string,
  endDate: string
): Promise<{ payload: AnalyticsDashboardPayload; cacheHit: boolean }> {
  const cacheKey = `${CACHE_KEYS.ANALYTICS}:${startDate}:${endDate}`
  const cached = await getCache<AnalyticsDashboardPayload>(cacheKey)
  if (cached) return { payload: cached, cacheHit: true }

  const supabase = createServiceClient()

  const { error: tableCheck } = await supabase.from('leads').select('id').limit(1)
  if (tableCheck?.code === '42P01') {
    return { payload: emptyAnalyticsPayload(startDate, endDate), cacheHit: false }
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

  const d = dashboard as AnalyticsDashboardRpc

  const result: AnalyticsDashboardPayload = {
    leadsBySource: d.leadsBySource ?? {},
    leadsByStatus: d.leadsByStatus ?? {},
    conversionRate: d.conversionRate ?? 0,
    repPerformance: d.repPerformance ?? [],
    followUpCompliance:
      Math.round(Math.min(100, Math.max(0, Number(d.followUpCompliance) || 0)) * 100) / 100,
    slaBreaches: d.slaBreaches ?? 0,
    leadsOverTime: d.leadsOverTime ?? [],
    leadsInterestedByProduct: d.leadsInterestedByProduct ?? [],
    convertedLeadsByProduct: d.convertedLeadsByProduct ?? [],
    period: { startDate, endDate },
  }

  await setCache(cacheKey, result, CACHE_TTL.LONG)
  return { payload: result, cacheHit: false }
}

/**
 * Heavy product × lead aggregation; cached globally (same for all viewers with access).
 */
export async function fetchProductsWithStatsCached(): Promise<ProductWithStats[]> {
  const cacheKey = CACHE_KEYS.PRODUCTS_WITH_STATS
  const cached = await getCache<ProductWithStats[]>(cacheKey)
  if (cached && Array.isArray(cached)) return cached

  const data = await getProductsWithStats()
  await setCache(cacheKey, data, CACHE_TTL.VERY_LONG)
  return data
}
