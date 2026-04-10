import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'

export const maxDuration = 60
import { createServiceClient } from '@/lib/supabase/service'
import { safeParseJsonResponse } from '@/shared/utils/safe-parse-json'
import {
  getInterestedProductFromMeta,
  getLocationFromMeta,
} from '@/shared/utils/lead-meta'
import { fetchAllLeadsFromMeta } from '@/backend/services/meta-leads.service'

type FbSettings = {
  id: string
  access_token: string
  ad_account_id: string | null
  page_id: string | null
  page_access_token: string | null
  expires_at: string | null
}

type MetaCampaign = {
  id: string
  name: string
  status: string
  objective?: string
}

type MetaInsights = {
  impressions?: string
  reach?: string
  clicks?: string
  spend?: string
  actions?: Array<{ action_type: string; value: string }>
}

type MetaInsightsRegionRow = {
  region?: string
  publisher_platform?: string
  date_start?: string
  impressions?: string
  reach?: string
  spend?: string
  clicks?: string
  actions?: Array<{ action_type: string; value: string }>
}

function getDateRangeDays(dateRange: string): number {
  if (dateRange === 'last_7d') return 7
  if (dateRange === 'last_90d') return 90
  return 30
}

function filterLeadsByDateRange<T extends { createdTime: string }>(
  leads: T[],
  dateRange: string
): T[] {
  const days = getDateRangeDays(dateRange)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffMs = cutoff.getTime()
  return leads.filter((l) => new Date(l.createdTime).getTime() >= cutoffMs)
}

const emptyLeadAnalytics = {
  totalLeads: 0,
  byCampaign: [] as Array<{ name: string; count: number }>,
  byProduct: [] as Array<{ name: string; count: number }>,
  byLocation: [] as Array<{ location: string; count: number }>,
  byCity: [] as Array<{ city: string; count: number }>,
  byState: [] as Array<{ state: string; count: number }>,
  byRegion: [] as Array<{ region: string; impressions: number; reach: number }>,
}

/**
 * GET /api/marketing/meta-ads-overview
 * Fetches campaigns, insights, and lead analytics directly from Meta API.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('date_range') || 'last_30d'

    const supabase = createServiceClient()

    // Get Facebook Business connection (need page_id for leads, ad_account_id for campaigns)
    const { data: fbRows, error: settingsError } = await supabase
      .from('facebook_business_settings')
      .select('id, access_token, ad_account_id, page_id, page_access_token, expires_at')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    const fbSettings = (fbRows?.[0] ?? null) as FbSettings | null

    if (settingsError || !fbSettings) {
      return NextResponse.json({
        connected: false,
        error: 'Facebook Business account not connected',
        campaigns: [],
        leadAnalytics: emptyLeadAnalytics,
        dateRange,
      })
    }

    if (fbSettings.expires_at && new Date(fbSettings.expires_at) < new Date()) {
      return NextResponse.json({
        connected: false,
        error: 'Facebook access token expired',
        campaigns: [],
        leadAnalytics: emptyLeadAnalytics,
        dateRange,
      })
    }

    const accessToken = fbSettings.access_token
    const accountId = searchParams.get('ad_account_id') || fbSettings.ad_account_id

    if (!accountId) {
      return NextResponse.json({
        connected: false,
        error: 'No ad account ID',
        campaigns: [],
        leadAnalytics: emptyLeadAnalytics,
        dateRange,
      })
    }

    // 1. Fetch campaigns with insights from Meta
    const campaignsUrl = `https://graph.facebook.com/v25.0/${accountId}/campaigns?fields=id,name,status,objective,insights{impressions,reach,clicks,spend,actions}&date_preset=${dateRange}&access_token=${accessToken}`
    const campaignsRes = await fetch(campaignsUrl)
    const campaignsParsed = await safeParseJsonResponse<{
      data?: Array<MetaCampaign & { insights?: { data?: MetaInsights[] } }>
      error?: { message?: string }
    }>(campaignsRes)

    const campaignsList: Array<{
      id: string
      name: string
      status: string
      impressions: number
      reach: number
      leads: number
      clicks: number
      spend: string
    }> = []

    if (campaignsParsed.ok && Array.isArray(campaignsParsed.data?.data)) {
      for (const c of campaignsParsed.data!.data) {
        const insightsRaw = (c as any).insights
        const insights: MetaInsights | undefined = Array.isArray(insightsRaw?.data)
          ? insightsRaw.data[0]
          : insightsRaw && typeof insightsRaw === 'object' && !Array.isArray(insightsRaw)
            ? insightsRaw
            : undefined
        const actions = insights?.actions || []
        const leadAction = actions.find((a) => a.action_type === 'lead') || { value: '0' }
        campaignsList.push({
          id: c.id,
          name: c.name || 'Unnamed',
          status: c.status || 'UNKNOWN',
          impressions: parseInt(insights?.impressions || '0', 10),
          reach: parseInt(insights?.reach || '0', 10),
          leads: parseInt(leadAction.value || '0', 10),
          clicks: parseInt(insights?.clicks || '0', 10),
          spend: insights?.spend || '0',
        })
      }
    } else if (campaignsParsed.ok && campaignsParsed.data?.error) {
      console.warn('Meta campaigns API error:', campaignsParsed.data.error)
    }

    // 2. Fetch insights by region (impressions/reach by region) from Meta
    let byRegion: Array<{ region: string; impressions: number; reach: number }> = []
    try {
      const insightsRegionUrl = `https://graph.facebook.com/v25.0/${accountId}/insights?fields=impressions,reach,spend,actions&breakdowns=region&date_preset=${dateRange}&access_token=${accessToken}`
      const regionRes = await fetch(insightsRegionUrl)
      const regionParsed = await safeParseJsonResponse<{
        data?: MetaInsightsRegionRow[]
        error?: { message?: string }
      }>(regionRes)

      if (regionParsed.ok && Array.isArray(regionParsed.data?.data)) {
        byRegion = regionParsed.data.data
          .filter((r) => r.region)
          .map((r) => ({
            region: r.region!,
            impressions: parseInt(r.impressions || '0', 10),
            reach: parseInt(r.reach || '0', 10),
          }))
          .sort((a, b) => b.impressions - a.impressions)
        // Return all regions (no slice) so overview shows every state Meta returns
      }
    } catch (err) {
      console.warn('Meta insights by region error:', err)
    }

    // 3. Fetch leads from Meta Lead Gen API and aggregate by product, city, state, campaign
    // Only include leads from campaigns in the selected ad account
    const campaignIdsInAccount = new Set(campaignsList.map((c) => c.id))
    let leadAnalyticsPayload = { ...emptyLeadAnalytics, byRegion }
    try {
      const metaLeads = await fetchAllLeadsFromMeta(user.id)
      const byDateRange = filterLeadsByDateRange(metaLeads, dateRange)
      const filtered = byDateRange.filter(
        (lead) => lead.campaignId && campaignIdsInAccount.has(lead.campaignId)
      )

      const byCampaign: Record<string, number> = {}
      const byProduct: Record<string, number> = {}
      const byCity: Record<string, number> = {}
      const byState: Record<string, number> = {}
      const byCityState: Record<string, number> = {}

      for (const lead of filtered) {
        const key = lead.campaignName || lead.campaignId || 'Unknown'
        byCampaign[key] = (byCampaign[key] ?? 0) + 1
        const product = getInterestedProductFromMeta(lead.metaData) || 'Not specified'
        const productKey = product.trim() || 'Not specified'
        byProduct[productKey] = (byProduct[productKey] ?? 0) + 1
        const { city, state } = getLocationFromMeta(lead.metaData)
        if (city) byCity[city] = (byCity[city] ?? 0) + 1
        if (state) byState[state] = (byState[state] ?? 0) + 1
        if (city || state) {
          const locKey = [city, state].filter(Boolean).join(', ') || 'Unknown'
          byCityState[locKey] = (byCityState[locKey] ?? 0) + 1
        }
      }

      const topProducts = Object.entries(byProduct)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }))
      const topLocations = Object.entries(byCityState)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([location, count]) => ({ location, count }))
      const topCities = Object.entries(byCity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([city, count]) => ({ city, count }))
      const topStates = Object.entries(byState)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([state, count]) => ({ state, count }))

      leadAnalyticsPayload = {
        totalLeads: filtered.length,
        byCampaign: Object.entries(byCampaign).map(([name, count]) => ({ name, count })),
        byProduct: topProducts,
        byLocation: topLocations,
        byCity: topCities,
        byState: topStates,
        byRegion,
      }
    } catch (err) {
      console.warn('Meta leads fetch error (page_id may be missing):', err)
      leadAnalyticsPayload = { ...leadAnalyticsPayload, byRegion }
    }

    // Merge Meta API leads (form submissions) with Meta-fetched lead counts by campaign
    const campaignsWithLeads = campaignsList.map((c) => {
      const metaLeadsCount =
        leadAnalyticsPayload.byCampaign.find(
          (b) => b.name === c.name || b.name === c.id
        )?.count ?? 0
      return {
        ...c,
        crmLeads: metaLeadsCount, // from Meta Lead Gen API
        formsFilled: c.leads, // from Meta campaigns insights
      }
    })

    // 4. Fetch account-level insights (totals + daily breakdown for performance chart)
    let accountSummary: {
      spend: number
      impressions: number
      reach: number
      clicks: number
      leads: number
      cpm: number
      ctr: number
      cpl: number
    } = { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, cpm: 0, ctr: 0, cpl: 0 }
    let insightsOverTime: Array<{ date: string; impressions: number; reach: number; spend: number; clicks: number; leads: number }> = []
    try {
      const summaryUrl = `https://graph.facebook.com/v25.0/${accountId}/insights?fields=impressions,reach,clicks,spend,actions&date_preset=${dateRange}&summary=impressions,reach,clicks,spend,actions&access_token=${accessToken}`
      const summaryRes = await fetch(summaryUrl)
      const summaryParsed = await safeParseJsonResponse<{
        data?: Array<Record<string, unknown>>
        summary?: Record<string, unknown>
        error?: { message?: string }
      }>(summaryRes)

      if (summaryParsed.ok && summaryParsed.data) {
        const d = summaryParsed.data as Record<string, unknown>
        const dataRows = Array.isArray(d.data) ? d.data : []
        const summaryObj = d.summary as Record<string, unknown> | undefined
        const first = dataRows[0] as Record<string, unknown> | undefined || summaryObj
        if (first && typeof first === 'object') {
          const spend = parseFloat(String(first.spend ?? '0'))
          const impressions = parseInt(String(first.impressions ?? '0'), 10)
          const reach = parseInt(String(first.reach ?? '0'), 10)
          const clicks = parseInt(String(first.clicks ?? '0'), 10)
          const actions = (first.actions as Array<{ action_type: string; value: string }>) || []
          const leadAction = actions.find((a) => a.action_type === 'lead')
          const leads = parseInt(leadAction?.value || '0', 10)
          accountSummary = {
            spend,
            impressions,
            reach,
            clicks,
            leads,
            cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            cpl: leads > 0 ? spend / leads : 0,
          }
        }
      }

      // Fallback: if account insights return zeros but we have campaign data, aggregate from campaigns
      if (
        accountSummary.impressions === 0 &&
        accountSummary.spend === 0 &&
        campaignsList.length > 0
      ) {
        const totalSpend = campaignsList.reduce((s, c) => s + parseFloat(c.spend || '0'), 0)
        const totalImpressions = campaignsList.reduce((s, c) => s + c.impressions, 0)
        const totalReach = campaignsList.reduce((s, c) => s + c.reach, 0)
        const totalLeads = campaignsList.reduce((s, c) => s + c.leads, 0)
        const totalClicks = campaignsList.reduce((s, c) => s + (c.clicks ?? 0), 0)
        accountSummary = {
          spend: totalSpend,
          impressions: totalImpressions,
          reach: totalReach,
          clicks: totalClicks,
          leads: totalLeads,
          cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
          ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
          cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
        }
      }

      // Daily breakdown for performance chart
      const dailyUrl = `https://graph.facebook.com/v25.0/${accountId}/insights?fields=impressions,reach,clicks,spend,actions&date_preset=${dateRange}&time_increment=1&access_token=${accessToken}`
      const dailyRes = await fetch(dailyUrl)
      const dailyParsed = await safeParseJsonResponse<{ data?: MetaInsightsRegionRow[] }>(dailyRes)
      if (dailyParsed.ok && Array.isArray(dailyParsed.data?.data)) {
        insightsOverTime = dailyParsed.data.data
          .filter((r): r is MetaInsightsRegionRow & { date_start: string } => !!r.date_start)
          .map((r) => {
            const actions = r.actions || []
            const leadAction = actions.find((a) => a.action_type === 'lead')
            return {
              date: r.date_start,
              impressions: parseInt(r.impressions || '0', 10),
              reach: parseInt(r.reach || '0', 10),
              spend: parseFloat(r.spend || '0'),
              clicks: parseInt(r.clicks || '0', 10),
              leads: parseInt(leadAction?.value || '0', 10),
            }
          })
          .sort((a, b) => a.date.localeCompare(b.date))
      }
    } catch (err) {
      console.warn('Meta account insights error:', err)
    }

    // 5. Fetch insights by publisher_platform (Facebook, Instagram, etc.)
    let byPlatform: Array<{ platform: string; impressions: number; reach: number; spend: number; clicks: number }> = []
    try {
      const platformUrl = `https://graph.facebook.com/v25.0/${accountId}/insights?fields=impressions,reach,clicks,spend&breakdowns=publisher_platform&date_preset=${dateRange}&access_token=${accessToken}`
      const platformRes = await fetch(platformUrl)
      const platformParsed = await safeParseJsonResponse<{ data?: MetaInsightsRegionRow[] }>(platformRes)
      if (platformParsed.ok && Array.isArray(platformParsed.data?.data)) {
        byPlatform = platformParsed.data.data
          .filter((r) => r.publisher_platform)
          .map((r) => ({
            platform: r.publisher_platform || 'Unknown',
            impressions: parseInt(r.impressions || '0', 10),
            reach: parseInt(r.reach || '0', 10),
            spend: parseFloat(r.spend || '0'),
            clicks: parseInt(r.clicks || '0', 10),
          }))
          .sort((a, b) => b.impressions - a.impressions)
      }
    } catch (err) {
      console.warn('Meta platform breakdown error:', err)
    }

    return NextResponse.json({
      connected: true,
      campaigns: campaignsWithLeads,
      leadAnalytics: leadAnalyticsPayload,
      accountSummary,
      insightsOverTime,
      byPlatform,
      dateRange,
    })
  } catch (error) {
    console.error('Meta ads overview error:', error)
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : 'Failed to load',
        campaigns: [],
        leadAnalytics: emptyLeadAnalytics,
      },
      { status: 500 }
    )
  }
}
