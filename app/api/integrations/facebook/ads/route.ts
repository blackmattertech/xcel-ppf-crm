import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { safeParseJsonResponse } from '@/shared/utils/safe-parse-json'

type FbSettings = {
  id: string
  access_token: string
  ad_account_id: string | null
  expires_at: string | null
}

type MetaInsights = {
  actions?: Array<{ action_type: string; value: string }>
  impressions?: string
  clicks?: string
  spend?: string
  ctr?: string
  cpc?: string
  cpp?: string
  cpm?: string
  reach?: string
  frequency?: string
}

/**
 * GET /api/integrations/facebook/ads
 * Fetch ad performance data from Meta Ads
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const searchParams = request.nextUrl.searchParams
    const adAccountId = searchParams.get('ad_account_id')
    const dateRange = searchParams.get('date_range') || 'last_30d' // last_7d, last_30d, last_90d, etc.

    const supabase = createServiceClient()

    // Get active Facebook Business connection
    const { data: rows, error: settingsError } = await supabase
      .from('facebook_business_settings')
      .select('id, access_token, ad_account_id, expires_at')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    const fbSettings = (rows?.[0] ?? null) as FbSettings | null
    if (settingsError || !fbSettings) {
      return NextResponse.json(
        { error: 'Facebook Business account not connected. Please connect your account in Settings.' },
        { status: 404 }
      )
    }

    // Check if token is expired
    if (fbSettings.expires_at && new Date(fbSettings.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Facebook access token has expired. Please reconnect your account.' },
        { status: 401 }
      )
    }

    const accessToken = fbSettings.access_token
    const accountId = adAccountId || fbSettings.ad_account_id

    if (!accountId) {
      return NextResponse.json(
        { error: 'No ad account ID available. Please reconnect your Facebook Business account.' },
        { status: 400 }
      )
    }

    // Fetch ad insights from Meta Marketing API
    const insightsUrl = `https://graph.facebook.com/v25.0/${accountId}/insights?fields=impressions,clicks,spend,ctr,cpc,cpp,cpm,reach,frequency,actions&date_preset=${dateRange}&access_token=${accessToken}`

    const insightsResponse = await fetch(insightsUrl)

    const insightsParsed = await safeParseJsonResponse<{
      data?: unknown[]
      error?: { message?: string }
    }>(insightsResponse)
    if (!insightsResponse.ok) {
      const errMsg = insightsParsed.ok && insightsParsed.data?.error?.message
        ? insightsParsed.data.error.message
        : 'Failed to fetch ad insights from Meta'
      console.error('Meta Ads API error:', insightsParsed.ok ? insightsParsed.data : insightsParsed.error)
      return NextResponse.json(
        { error: errMsg },
        { status: insightsResponse.status }
      )
    }
    const insightsData = insightsParsed.ok && insightsParsed.data ? insightsParsed.data : { data: [] }

    // Fetch campaigns
    const campaignsUrl = `https://graph.facebook.com/v25.0/${accountId}/campaigns?fields=id,name,status,objective,created_time,updated_time&access_token=${accessToken}`
    const campaignsResponse = await fetch(campaignsUrl)
    const campaignsParsed = campaignsResponse.ok
      ? await safeParseJsonResponse<{ data?: unknown[] }>(campaignsResponse)
      : null
    const campaignsData =
      campaignsResponse.ok && campaignsParsed?.ok && campaignsParsed.data
        ? campaignsParsed.data
        : { data: [] }

    // Fetch adsets
    const adsetsUrl = `https://graph.facebook.com/v25.0/${accountId}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget,start_time,end_time&access_token=${accessToken}`
    const adsetsResponse = await fetch(adsetsUrl)
    const adsetsParsed = adsetsResponse.ok
      ? await safeParseJsonResponse<{ data?: unknown[] }>(adsetsResponse)
      : null
    const adsetsData =
      adsetsResponse.ok && adsetsParsed?.ok && adsetsParsed.data
        ? adsetsParsed.data
        : { data: [] }

    // Fetch active ads
    const adsUrl = `https://graph.facebook.com/v25.0/${accountId}/ads?fields=id,name,status,adset_id,campaign_id,creative&access_token=${accessToken}`
    const adsResponse = await fetch(adsUrl)
    const adsParsed = adsResponse.ok ? await safeParseJsonResponse<{ data?: unknown[] }>(adsResponse) : null
    const adsData = adsResponse.ok && adsParsed?.ok && adsParsed.data ? adsParsed.data : { data: [] }

    // Aggregate insights
    const totalInsights = (insightsData.data?.[0] || {}) as MetaInsights
    const actions = totalInsights.actions || []

    // Extract lead actions
    const leadActions = actions.find((a: any) => a.action_type === 'lead') || { value: '0' }
    const linkClicks = actions.find((a: any) => a.action_type === 'link_click') || { value: '0' }

    return NextResponse.json({
      insights: {
        impressions: totalInsights.impressions || '0',
        clicks: totalInsights.clicks || '0',
        spend: totalInsights.spend || '0',
        ctr: totalInsights.ctr || '0',
        cpc: totalInsights.cpc || '0',
        cpp: totalInsights.cpp || '0',
        cpm: totalInsights.cpm || '0',
        reach: totalInsights.reach || '0',
        frequency: totalInsights.frequency || '0',
        leads: leadActions.value || '0',
        linkClicks: linkClicks.value || '0',
      },
      campaigns: {
        total: campaignsData.data?.length || 0,
        active: campaignsData.data?.filter((c: any) => c.status === 'ACTIVE').length || 0,
        list: campaignsData.data || [],
      },
      adsets: {
        total: adsetsData.data?.length || 0,
        active: adsetsData.data?.filter((a: any) => a.status === 'ACTIVE').length || 0,
        list: adsetsData.data || [],
      },
      ads: {
        total: adsData.data?.length || 0,
        active: adsData.data?.filter((a: any) => a.status === 'ACTIVE').length || 0,
        list: adsData.data || [],
      },
      dateRange,
    })
  } catch (error) {
    console.error('Facebook ads API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Meta Ads data' },
      { status: 500 }
    )
  }
}
