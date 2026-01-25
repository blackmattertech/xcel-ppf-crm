import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

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
        period: {
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        },
      })
    }
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    // Leads by source
    const { data: leadsBySource } = await supabase
      .from('leads')
      .select('source')
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    const sourceCounts: Record<string, number> = {}
    leadsBySource?.forEach((lead) => {
      sourceCounts[lead.source] = (sourceCounts[lead.source] || 0) + 1
    })

    // Leads by status
    const { data: leadsByStatus } = await supabase
      .from('leads')
      .select('status')
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    const statusCounts: Record<string, number> = {}
    leadsByStatus?.forEach((lead) => {
      statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1
    })

    // Conversion rate
    const totalLeads = leadsByStatus?.length || 0
    const convertedLeads = statusCounts['converted'] || 0
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0

    // Rep performance
    const { data: repPerformance } = await supabase
      .from('leads')
      .select('assigned_to, status')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .not('assigned_to', 'is', null)

    const repStats: Record<string, { total: number; converted: number }> = {}
    repPerformance?.forEach((lead) => {
      if (lead.assigned_to) {
        if (!repStats[lead.assigned_to]) {
          repStats[lead.assigned_to] = { total: 0, converted: 0 }
        }
        repStats[lead.assigned_to].total++
        if (lead.status === 'converted') {
          repStats[lead.assigned_to].converted++
        }
      }
    })

    // Get user names for rep performance
    const userIds = Object.keys(repStats)
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .in('id', userIds)

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
    const { data: followUps } = await supabase
      .from('follow_ups')
      .select('status, scheduled_at')
      .gte('scheduled_at', startDate)
      .lte('scheduled_at', endDate)

    const totalFollowUps = followUps?.length || 0
    const completedFollowUps = followUps?.filter((f) => f.status === 'done').length || 0
    const followUpCompliance = totalFollowUps > 0 ? (completedFollowUps / totalFollowUps) * 100 : 0

    // SLA breaches (leads without first contact within 5 minutes)
    const { data: slaLeads } = await supabase
      .from('leads')
      .select('created_at, first_contact_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('status', 'new')

    const slaBreaches = slaLeads?.filter((lead) => {
      if (!lead.first_contact_at) return true
      const created = new Date(lead.created_at)
      const contacted = new Date(lead.first_contact_at)
      const diffMinutes = (contacted.getTime() - created.getTime()) / (1000 * 60)
      return diffMinutes > 5
    }).length || 0

    return NextResponse.json({
      leadsBySource: sourceCounts,
      leadsByStatus: statusCounts,
      conversionRate: Math.round(conversionRate * 100) / 100,
      repPerformance: repPerformanceWithNames,
      followUpCompliance: Math.round(followUpCompliance * 100) / 100,
      slaBreaches,
      period: {
        startDate,
        endDate,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
