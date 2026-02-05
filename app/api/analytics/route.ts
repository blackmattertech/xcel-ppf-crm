import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache'

interface LeadSourceRow {
  source: string
}

interface LeadStatusRow {
  status: string
}

interface LeadRepPerformanceRow {
  assigned_to: string | null
  status: string
}

interface UserRow {
  id: string
  name: string
}

interface FollowUpRow {
  status: string
  scheduled_at: string
}

interface LeadSlaRow {
  created_at: string
  first_contact_at: string | null
}

interface LeadTimeRow {
  created_at: string
  status: string
}

export async function GET(request: NextRequest) {
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
      return NextResponse.json(cached)
    }

    // Leads by source
    const { data: leadsBySourceData } = await supabase
      .from('leads')
      .select('source')
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    const leadsBySource = leadsBySourceData as LeadSourceRow[] | null

    const sourceCounts: Record<string, number> = {}
    leadsBySource?.forEach((lead) => {
      sourceCounts[lead.source] = (sourceCounts[lead.source] || 0) + 1
    })

    // Leads by status
    const { data: leadsByStatusData } = await supabase
      .from('leads')
      .select('status')
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    const leadsByStatus = leadsByStatusData as LeadStatusRow[] | null

    const statusCounts: Record<string, number> = {}
    leadsByStatus?.forEach((lead) => {
      statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1
    })

    // Conversion rate: count leads that have been converted to customer (any post-deal status)
    const CONVERTED_STATUSES = ['converted', 'deal_won', 'fully_paid', 'advance_received', 'payment_pending']
    const totalLeads = leadsByStatus?.length || 0
    const convertedLeads = CONVERTED_STATUSES.reduce((sum, s) => sum + (statusCounts[s] || 0), 0)
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0

    // Rep performance
    const { data: repPerformanceData } = await supabase
      .from('leads')
      .select('assigned_to, status')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .not('assigned_to', 'is', null)

    const repPerformance = repPerformanceData as LeadRepPerformanceRow[] | null

    const repStats: Record<string, { total: number; converted: number }> = {}
    repPerformance?.forEach((lead) => {
      if (lead.assigned_to) {
        if (!repStats[lead.assigned_to]) {
          repStats[lead.assigned_to] = { total: 0, converted: 0 }
        }
        repStats[lead.assigned_to].total++
        if (lead.status && CONVERTED_STATUSES.includes(lead.status)) {
          repStats[lead.assigned_to].converted++
        }
      }
    })

    // Get user names for rep performance
    const userIds = Object.keys(repStats)
    const { data: usersData } = await supabase
      .from('users')
      .select('id, name')
      .in('id', userIds)

    const users = usersData as UserRow[] | null

    const repPerformanceWithNames = userIds.map((userId) => {
      const user = users?.find((u) => u.id === userId)
      const stats = repStats[userId]
      return {
        user_id: userId,
        user_name: user?.name || 'Unknown',
        total_leads: stats.total,
        converted_leads: stats.converted,
        conversion_rate: stats.total > 0 ? (stats.converted / stats.total) * 100 : 0,
      }
    })

    // Follow-up compliance
    const { data: followUpsData } = await supabase
      .from('follow_ups')
      .select('status, scheduled_at')
      .gte('scheduled_at', startDate)
      .lte('scheduled_at', endDate)

    const followUps = followUpsData as FollowUpRow[] | null

    const totalFollowUps = followUps?.length || 0
    const completedFollowUps = followUps?.filter((f) => f.status === 'done').length || 0
    const followUpComplianceRaw = totalFollowUps > 0 ? (completedFollowUps / totalFollowUps) * 100 : 0
    const followUpCompliance = Number.isFinite(followUpComplianceRaw) ? followUpComplianceRaw : 0

    // SLA breaches (leads without first contact within 5 minutes)
    const { data: slaLeadsData } = await supabase
      .from('leads')
      .select('created_at, first_contact_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('status', 'new')

    const slaLeads = slaLeadsData as LeadSlaRow[] | null

    const slaBreaches = slaLeads?.filter((lead) => {
      if (!lead.first_contact_at) return true
      const created = new Date(lead.created_at)
      const contacted = new Date(lead.first_contact_at)
      const diffMinutes = (contacted.getTime() - created.getTime()) / (1000 * 60)
      return diffMinutes > 5
    }).length || 0

    // Leads over time (daily buckets) for line chart
    const { data: leadsTimeData } = await supabase
      .from('leads')
      .select('created_at, status')
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    const leadsTime = leadsTimeData as LeadTimeRow[] | null
    const dayMap: Record<string, { leads: number; converted: number }> = {}
    const start = new Date(startDate)
    const end = new Date(endDate)
    for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      dayMap[key] = { leads: 0, converted: 0 }
    }
    leadsTime?.forEach((lead) => {
      const key = lead.created_at.slice(0, 10)
      if (dayMap[key]) {
        dayMap[key].leads += 1
        if (lead.status && CONVERTED_STATUSES.includes(lead.status)) {
          dayMap[key].converted += 1
        }
      }
    })
    const leadsOverTime = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { leads, converted }]) => ({ date, leads, converted }))

    // Leads interested in products: match lead requirement to product titles
    const { data: productsData } = await supabase
      .from('products')
      .select('id, title')
      .eq('is_active', true)

    const { data: leadsRequirementData } = await supabase
      .from('leads')
      .select('requirement')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .not('requirement', 'is', null)

    const products = (productsData as { id: string; title: string }[]) || []
    const leadsWithRequirement = (leadsRequirementData as { requirement: string }[]) || []
    const leadsInterestedByProduct = products
      .filter((p) => p.title && p.title.trim())
      .map((p) => {
        const titleLower = (p.title || '').toLowerCase().trim()
        const count = leadsWithRequirement.filter((l) => {
          const req = (l.requirement || '').toLowerCase()
          return req && titleLower && req.includes(titleLower)
        }).length
        return { product_name: p.title!, product_id: p.id, leads_count: count }
      })
      .filter((row) => row.leads_count > 0)
      .sort((a, b) => b.leads_count - a.leads_count)

    // Converted leads by product: same match but only for leads in converted statuses
    const { data: convertedLeadsRequirementData } = await supabase
      .from('leads')
      .select('requirement, status')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .not('requirement', 'is', null)
      .in('status', CONVERTED_STATUSES)

    const convertedWithRequirement = (convertedLeadsRequirementData as { requirement: string; status: string }[]) || []
    const convertedLeadsByProduct = products
      .filter((p) => p.title && p.title.trim())
      .map((p) => {
        const titleLower = (p.title || '').toLowerCase().trim()
        const count = convertedWithRequirement.filter((l) => {
          const req = (l.requirement || '').toLowerCase()
          return req && titleLower && req.includes(titleLower)
        }).length
        return { product_name: p.title!, product_id: p.id, leads_count: count }
      })
      .filter((row) => row.leads_count > 0)
      .sort((a, b) => b.leads_count - a.leads_count)

    const result = {
      leadsBySource: sourceCounts,
      leadsByStatus: statusCounts,
      conversionRate: Math.round(conversionRate * 100) / 100,
      repPerformance: repPerformanceWithNames,
      followUpCompliance: Math.round(Math.min(100, Math.max(0, followUpCompliance)) * 100) / 100,
      slaBreaches,
      leadsOverTime,
      leadsInterestedByProduct,
      convertedLeadsByProduct,
      period: {
        startDate,
        endDate,
      },
    }

    // Cache result for 60 seconds (analytics data changes frequently)
    await setCache(cacheKey, result, CACHE_TTL.MEDIUM)

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
