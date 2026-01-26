import { createServiceClient } from '@/lib/supabase/service'

export interface PipelineMetrics {
  stage: string
  leadCount: number
  averageTimeInStage: number // hours
  conversionRate: number // percentage
  dropOffRate: number // percentage
}

export interface SourceROI {
  source: string
  totalLeads: number
  convertedLeads: number
  conversionRate: number
  totalRevenue: number
  averageDealValue: number
  costPerLead: number
  roi: number // percentage
}

export interface CohortAnalysis {
  cohort: string // e.g., "2024-01"
  totalLeads: number
  convertedLeads: number
  conversionRate: number
  averageTimeToConvert: number // days
  totalRevenue: number
}

/**
 * Get pipeline velocity metrics
 */
export async function getPipelineMetrics(
  startDate?: string,
  endDate?: string
): Promise<PipelineMetrics[]> {
  const supabase = createServiceClient()

  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const end = endDate || new Date().toISOString()

  // Define pipeline stages
  const stages = [
    'new',
    'qualified',
    'quotation_shared',
    'quotation_viewed',
    'quotation_accepted',
    'interested',
    'negotiation',
    'deal_won',
    'converted',
  ]

  // Fetch all leads in period once
  const { data: allLeads } = await supabase
    .from('leads')
    .select('id, status, created_at, updated_at')
    .gte('created_at', start)
    .lte('created_at', end)

  if (!allLeads || allLeads.length === 0) {
    return stages.map(stage => ({
      stage,
      leadCount: 0,
      averageTimeInStage: 0,
      conversionRate: 0,
      dropOffRate: 0,
    }))
  }

  // Fetch all status history in one query
  const leadIds = allLeads.map(l => l.id)
  const { data: allStatusHistory } = leadIds.length > 0 ? await supabase
    .from('lead_status_history')
    .select('lead_id, old_status, new_status, created_at')
    .in('lead_id', leadIds)
    .gte('created_at', start)
    .lte('created_at', end) : { data: null }

  // Organize status history by lead_id and stage
  const statusHistoryMap = new Map<string, Map<string, any[]>>()
  if (allStatusHistory) {
    for (const history of allStatusHistory) {
      if (!statusHistoryMap.has(history.lead_id)) {
        statusHistoryMap.set(history.lead_id, new Map())
      }
      const leadHistory = statusHistoryMap.get(history.lead_id)!
      if (!leadHistory.has(history.new_status)) {
        leadHistory.set(history.new_status, [])
      }
      leadHistory.get(history.new_status)!.push(history)
    }
  }

  const metrics: PipelineMetrics[] = []

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    const nextStage = stages[i + 1]

    // Filter leads in this stage
    const stageLeads = allLeads.filter(l => l.status === stage)
    const leadCount = stageLeads.length

    // Calculate average time in stage
    let totalTimeInStage = 0
    let countWithTime = 0

    for (const lead of stageLeads) {
      const leadHistory = statusHistoryMap.get(lead.id)
      const stageEntries = leadHistory?.get(stage) || []
      const enteredAt = stageEntries.length > 0 
        ? stageEntries[0].created_at 
        : lead.created_at
      const leftAt = lead.updated_at || new Date().toISOString()

      const hours = (new Date(leftAt).getTime() - new Date(enteredAt).getTime()) / (1000 * 60 * 60)
      if (hours >= 0) {
        totalTimeInStage += hours
        countWithTime++
      }
    }

    const averageTimeInStage = countWithTime > 0 ? totalTimeInStage / countWithTime : 0

    // Calculate conversion rate to next stage
    let conversionRate = 0
    if (nextStage && allStatusHistory) {
      const convertedLeads = new Set(
        allStatusHistory
          .filter(h => h.old_status === stage && h.new_status === nextStage)
          .map(h => h.lead_id)
      )
      conversionRate = leadCount > 0 ? (convertedLeads.size / leadCount) * 100 : 0
    }

    // Calculate drop-off rate (leads that went to lost/discarded)
    let dropOffRate = 0
    if (allStatusHistory) {
      const lostLeads = new Set(
        allStatusHistory
          .filter(h => h.old_status === stage && ['lost', 'discarded'].includes(h.new_status))
          .map(h => h.lead_id)
      )
      dropOffRate = leadCount > 0 ? (lostLeads.size / leadCount) * 100 : 0
    }

    metrics.push({
      stage,
      leadCount,
      averageTimeInStage: Math.round(averageTimeInStage * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      dropOffRate: Math.round(dropOffRate * 100) / 100,
    })
  }

  return metrics
}

/**
 * Get source ROI analytics
 */
export async function getSourceROI(
  startDate?: string,
  endDate?: string
): Promise<SourceROI[]> {
  const supabase = createServiceClient()

  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const end = endDate || new Date().toISOString()

  // Get all leads in period
  const { data: leads } = await supabase
    .from('leads')
    .select('id, source, status, payment_amount, advance_amount')
    .gte('created_at', start)
    .lte('created_at', end)

  if (!leads || leads.length === 0) {
    return []
  }

  // Get all customers for these leads in one query
  const leadIds = leads.map(l => l.id)
  const { data: customers } = await supabase
    .from('customers')
    .select('lead_id')
    .in('lead_id', leadIds)
    .not('lead_id', 'is', null)
  
  const convertedLeadIds = new Set(customers?.map(c => c.lead_id).filter(Boolean) || [])

  // Group by source
  const sourceMap = new Map<string, SourceROI>()

  for (const lead of leads) {
    if (!sourceMap.has(lead.source)) {
      sourceMap.set(lead.source, {
        source: lead.source,
        totalLeads: 0,
        convertedLeads: 0,
        conversionRate: 0,
        totalRevenue: 0,
        averageDealValue: 0,
        costPerLead: 0, // Would need cost data from external source
        roi: 0,
      })
    }

    const sourceData = sourceMap.get(lead.source)!
    sourceData.totalLeads++

    // Check if converted to customer (has customer record)
    if (convertedLeadIds.has(lead.id)) {
      sourceData.convertedLeads++

      // Calculate revenue
      const revenue = parseFloat(lead.payment_amount as any) || parseFloat(lead.advance_amount as any) || 0
      sourceData.totalRevenue += revenue
    }
  }

  // Calculate metrics
  const results: SourceROI[] = []
  for (const sourceData of sourceMap.values()) {
    sourceData.conversionRate =
      sourceData.totalLeads > 0 ? (sourceData.convertedLeads / sourceData.totalLeads) * 100 : 0
    sourceData.averageDealValue =
      sourceData.convertedLeads > 0 ? sourceData.totalRevenue / sourceData.convertedLeads : 0

    // ROI calculation (assuming cost per lead - would need actual cost data)
    // ROI = ((Revenue - Cost) / Cost) * 100
    // For now, we'll use a placeholder
    sourceData.costPerLead = 0 // TODO: Get from cost tracking
    const totalCost = sourceData.totalLeads * sourceData.costPerLead
    sourceData.roi = totalCost > 0 ? ((sourceData.totalRevenue - totalCost) / totalCost) * 100 : 0

    results.push({
      ...sourceData,
      conversionRate: Math.round(sourceData.conversionRate * 100) / 100,
      averageDealValue: Math.round(sourceData.averageDealValue * 100) / 100,
      roi: Math.round(sourceData.roi * 100) / 100,
    })
  }

  return results.sort((a, b) => b.roi - a.roi)
}

/**
 * Get cohort analysis
 */
export async function getCohortAnalysis(
  period: 'month' | 'week' = 'month'
): Promise<CohortAnalysis[]> {
  const supabase = createServiceClient()

  // Get all leads grouped by cohort
  const { data: leads } = await supabase
    .from('leads')
    .select('id, created_at, status, converted_at, payment_amount, advance_amount')
    .order('created_at', { ascending: true })

  if (!leads || leads.length === 0) {
    return []
  }

  // Get all customers for these leads in one query
  const leadIds = leads.map(l => l.id)
  const { data: customers } = await supabase
    .from('customers')
    .select('lead_id, created_at')
    .in('lead_id', leadIds)
    .not('lead_id', 'is', null)
  
  const customerMap = new Map()
  if (customers) {
    customers.forEach((c: any) => {
      if (c.lead_id) {
        customerMap.set(c.lead_id, c)
      }
    })
  }

  // Group by cohort
  const cohortMap = new Map<string, CohortAnalysis>()

  for (const lead of leads) {
    const createdDate = new Date(lead.created_at)
    let cohortKey: string

    if (period === 'month') {
      cohortKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`
    } else {
      const week = Math.ceil(createdDate.getDate() / 7)
      cohortKey = `${createdDate.getFullYear()}-W${String(week).padStart(2, '0')}`
    }

    if (!cohortMap.has(cohortKey)) {
      cohortMap.set(cohortKey, {
        cohort: cohortKey,
        totalLeads: 0,
        convertedLeads: 0,
        conversionRate: 0,
        averageTimeToConvert: 0,
        totalRevenue: 0,
      })
    }

    const cohort = cohortMap.get(cohortKey)!
    cohort.totalLeads++

    // Check if converted to customer (has customer record)
    const customer = customerMap.get(lead.id)
    
    if (customer) {
      cohort.convertedLeads++

      // Calculate time to convert
      const created = new Date(lead.created_at)
      const converted = new Date(customer.created_at || lead.converted_at || new Date())
      const days = (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      cohort.averageTimeToConvert =
        (cohort.averageTimeToConvert * (cohort.convertedLeads - 1) + days) / cohort.convertedLeads

      // Calculate revenue
      const revenue = parseFloat(lead.payment_amount as any) || parseFloat(lead.advance_amount as any) || 0
      cohort.totalRevenue += revenue
    }
  }

  // Calculate conversion rates
  const results: CohortAnalysis[] = []
  for (const cohort of cohortMap.values()) {
    cohort.conversionRate =
      cohort.totalLeads > 0 ? (cohort.convertedLeads / cohort.totalLeads) * 100 : 0

    results.push({
      ...cohort,
      conversionRate: Math.round(cohort.conversionRate * 100) / 100,
      averageTimeToConvert: Math.round(cohort.averageTimeToConvert * 100) / 100,
    })
  }

  return results.sort((a, b) => a.cohort.localeCompare(b.cohort))
}

/**
 * Get stage conversion funnel
 */
export async function getConversionFunnel(startDate?: string, endDate?: string) {
  const supabase = createServiceClient()

  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const end = endDate || new Date().toISOString()

  const stages = [
    'new',
    'qualified',
    'quotation_shared',
    'quotation_viewed',
    'quotation_accepted',
    'interested',
    'negotiation',
    'deal_won',
    'converted',
  ]

  // Fetch all leads in period once (only need status)
  const { data: allLeads } = await supabase
    .from('leads')
    .select('status')
    .gte('created_at', start)
    .lte('created_at', end)

  if (!allLeads || allLeads.length === 0) {
    return stages.map(stage => ({
      stage,
      count: 0,
      percentage: 0,
    }))
  }

  // Count leads by status
  const statusCounts = new Map<string, number>()
  for (const lead of allLeads) {
    const count = statusCounts.get(lead.status) || 0
    statusCounts.set(lead.status, count + 1)
  }

  // Get total new leads for percentage calculation
  const total = statusCounts.get('new') || 0

  const funnel: Array<{ stage: string; count: number; percentage: number }> = []

  for (const stage of stages) {
    const countValue = statusCounts.get(stage) || 0
    const percentage = total > 0 ? (countValue / total) * 100 : 0

    funnel.push({
      stage,
      count: countValue,
      percentage: Math.round(percentage * 100) / 100,
    })
  }

  return funnel
}

/**
 * Get rep performance analytics
 */
export async function getRepPerformance(
  startDate?: string,
  endDate?: string
): Promise<
  Array<{
    userId: string
    userName: string
    totalLeads: number
    convertedLeads: number
    conversionRate: number
    averageResponseTime: number
    averageTimeToConvert: number
    totalRevenue: number
    activeLeads: number
  }>
> {
  const supabase = createServiceClient()

  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const end = endDate || new Date().toISOString()

  // Get all assigned leads
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      id,
      assigned_to,
      status,
      created_at,
      first_contact_at,
      converted_at,
      payment_amount,
      advance_amount,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name
      )
    `)
    .not('assigned_to', 'is', null)
    .gte('created_at', start)
    .lte('created_at', end)

  if (!leads || leads.length === 0) {
    return []
  }

  // Get all customers for these leads in one query
  const leadIds = leads.map((l: any) => l.id)
  const { data: customers } = await supabase
    .from('customers')
    .select('lead_id, created_at')
    .in('lead_id', leadIds)
    .not('lead_id', 'is', null)
  
  const customerMap = new Map()
  if (customers) {
    customers.forEach((c: any) => {
      if (c.lead_id) {
        customerMap.set(c.lead_id, c)
      }
    })
  }

  // Group by user
  const userMap = new Map<
    string,
    {
      userId: string
      userName: string
      totalLeads: number
      convertedLeads: number
      responseTimes: number[]
      conversionTimes: number[]
      revenue: number
      activeLeads: number
    }
  >()

  for (const lead of leads) {
    const assignedTo = (lead as any).assigned_to
    const user = (lead as any).assigned_user

    if (!assignedTo || !user) continue

    if (!userMap.has(assignedTo)) {
      userMap.set(assignedTo, {
        userId: assignedTo,
        userName: user.name || 'Unknown',
        totalLeads: 0,
        convertedLeads: 0,
        responseTimes: [],
        conversionTimes: [],
        revenue: 0,
        activeLeads: 0,
      })
    }

    const userData = userMap.get(assignedTo)!
    userData.totalLeads++

    // Check if converted to customer (has customer record)
    const customer = customerMap.get(lead.id)
    
    if (customer) {
      userData.convertedLeads++

      // Calculate conversion time
      if (lead.created_at) {
        const convertedDate = customer.created_at || lead.converted_at || new Date()
        const days =
          (new Date(convertedDate).getTime() - new Date(lead.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
        userData.conversionTimes.push(days)
      }

      // Add revenue
      const revenue = parseFloat(lead.payment_amount as any) || parseFloat(lead.advance_amount as any) || 0
      userData.revenue += revenue
    }

    // Calculate response time
    if (lead.first_contact_at && lead.created_at) {
      const minutes =
        (new Date(lead.first_contact_at).getTime() - new Date(lead.created_at).getTime()) /
        (1000 * 60)
      if (minutes >= 0 && minutes < 1440) {
        // Only count reasonable response times
        userData.responseTimes.push(minutes)
      }
    }

    // Count active leads
    if (!['lost', 'discarded', 'fully_paid'].includes(lead.status)) {
      userData.activeLeads++
    }
  }

  // Calculate metrics
  const results = []
  for (const userData of userMap.values()) {
    const conversionRate =
      userData.totalLeads > 0 ? (userData.convertedLeads / userData.totalLeads) * 100 : 0

    const averageResponseTime =
      userData.responseTimes.length > 0
        ? userData.responseTimes.reduce((a, b) => a + b, 0) / userData.responseTimes.length
        : 0

    const averageTimeToConvert =
      userData.conversionTimes.length > 0
        ? userData.conversionTimes.reduce((a, b) => a + b, 0) / userData.conversionTimes.length
        : 0

    results.push({
      userId: userData.userId,
      userName: userData.userName,
      totalLeads: userData.totalLeads,
      convertedLeads: userData.convertedLeads,
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      averageTimeToConvert: Math.round(averageTimeToConvert * 100) / 100,
      totalRevenue: Math.round(userData.revenue * 100) / 100,
      activeLeads: userData.activeLeads,
    })
  }

  return results.sort((a, b) => b.conversionRate - a.conversionRate)
}
