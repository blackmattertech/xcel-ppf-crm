import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name
    const userId = user.id

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

    // Build base query for leads based on user role
    let leadsQuery = supabase
      .from('leads')
      .select('id, source, status, assigned_to, created_at, first_contact_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    // For tele-callers, filter by their assigned leads
    if (userRole === 'tele_caller') {
      leadsQuery = leadsQuery.eq('assigned_to', userId)
    }

    // Execute all queries in parallel for better performance
    const [
      leadsResult,
      followUpsResult,
    ] = await Promise.all([
      leadsQuery,
      // Follow-up compliance
      supabase
        .from('follow_ups')
        .select('status, scheduled_at')
        .gte('scheduled_at', startDate)
        .lte('scheduled_at', endDate),
    ])

    const allLeads = leadsResult.data || []
    const followUps = followUpsResult.data || []

    // Get all lead IDs to check for conversions
    const leadIds = allLeads.map((lead: any) => lead.id)
    
    // Fetch customers to determine actual conversions (conversion = lead exists in customers table)
    let convertedLeadIds: string[] = []
    if (leadIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('lead_id')
        .in('lead_id', leadIds)
        .not('lead_id', 'is', null)
      
      convertedLeadIds = (customers || []).map((c: any) => c.lead_id)
    }

    // Process source counts
    const sourceCounts: Record<string, number> = {}
    allLeads.forEach((lead: any) => {
      sourceCounts[lead.source] = (sourceCounts[lead.source] || 0) + 1
    })

    // Process status counts
    const statusCounts: Record<string, number> = {}
    allLeads.forEach((lead: any) => {
      statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1
    })

    // Calculate conversion rate based on actual customers (not lead status)
    // Conversion rate = (leads converted to customers / total assigned leads) * 100
    const totalLeads = allLeads.length
    const convertedLeads = convertedLeadIds.length
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0

    // Rep performance - only for admins/super_admins (all tele-callers)
    let repPerformanceData: any[] = []
    if (userRole === 'admin' || userRole === 'super_admin') {
      // Get all leads assigned to tele-callers
      const { data: allTeleCallerLeads } = await supabase
        .from('leads')
        .select('id, assigned_to, status')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .not('assigned_to', 'is', null)
      
      if (allTeleCallerLeads && allTeleCallerLeads.length > 0) {
        const allTeleCallerLeadIds = allTeleCallerLeads.map((l: any) => l.id)
        
        // Get all customers for these leads
        const { data: allCustomers } = await supabase
          .from('customers')
          .select('lead_id')
          .in('lead_id', allTeleCallerLeadIds)
          .not('lead_id', 'is', null)
        
        const convertedLeadIdsSet = new Set((allCustomers || []).map((c: any) => c.lead_id))
        
        // Process rep performance
        const repStats: Record<string, { total: number; converted: number }> = {}
        allTeleCallerLeads.forEach((lead: any) => {
          if (lead.assigned_to) {
            if (!repStats[lead.assigned_to]) {
              repStats[lead.assigned_to] = { total: 0, converted: 0 }
            }
            repStats[lead.assigned_to].total++
            if (convertedLeadIdsSet.has(lead.id)) {
              repStats[lead.assigned_to].converted++
            }
          }
        })

        // Get user names and profile images for rep performance
        const userIds = Object.keys(repStats)
        if (userIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, profile_image_url')
            .in('id', userIds)
          
          const users = usersData || []
          
          repPerformanceData = userIds.map((userId) => {
            const user = users.find((u: any) => u.id === userId)
            const stats = repStats[userId]
            return {
              user_id: userId,
              user_name: user?.name || 'Unknown',
              total_leads: stats.total,
              converted_leads: stats.converted,
              conversion_rate: stats.total > 0 ? (stats.converted / stats.total) * 100 : 0,
              profile_image_url: user?.profile_image_url || null,
            }
          })
        }
      }
    } else if (userRole === 'tele_caller') {
      // For tele-callers, show their own performance
      // Get profile image for the tele-caller
      const { data: userData } = await supabase
        .from('users')
        .select('profile_image_url')
        .eq('id', userId)
        .single()
      
      repPerformanceData = [{
        user_id: userId,
        user_name: user.name || 'You',
        total_leads: totalLeads,
        converted_leads: convertedLeads,
        conversion_rate: conversionRate,
        profile_image_url: userData?.profile_image_url || null,
      }]
    }

    // Follow-up compliance
    const totalFollowUps = followUps.length
    const completedFollowUps = followUps.filter((f) => f.status === 'done').length
    const followUpCompliance = totalFollowUps > 0 ? (completedFollowUps / totalFollowUps) * 100 : 0

    // SLA breaches - leads with status 'new' that haven't been contacted within 5 minutes
    const slaLeads = allLeads.filter((lead: any) => lead.status === 'new')
    const slaBreaches = slaLeads.filter((lead: any) => {
      if (!lead.first_contact_at) return true
      const created = new Date(lead.created_at)
      const contacted = new Date(lead.first_contact_at)
      const diffMinutes = (contacted.getTime() - created.getTime()) / (1000 * 60)
      return diffMinutes > 5
    }).length

    return NextResponse.json({
      leadsBySource: sourceCounts,
      leadsByStatus: statusCounts,
      conversionRate: Math.round(conversionRate * 100) / 100,
      repPerformance: repPerformanceData,
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
