import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type Lead = Database['public']['Tables']['leads']['Row']

export interface WinProbability {
  leadId: string
  probability: number // 0-100
  factors: Array<{ name: string; impact: number; reason: string }>
  confidence: number // 0-100
}

export interface ChurnRisk {
  leadId: string
  riskScore: number // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  factors: Array<{ name: string; impact: number; reason: string }>
  daysSinceLastActivity: number
}

export interface BestTimeToContact {
  leadId: string
  recommendedTime: string // ISO datetime
  confidence: number
  reason: string
}

/**
 * Calculate win probability for a lead
 */
export async function calculateWinProbability(leadId: string): Promise<WinProbability> {
  const supabase = createServiceClient()

  // Get lead with related data
  const { data: lead, error } = await supabase
    .from('leads')
    .select(`
      *,
      calls:calls (outcome, call_duration),
      follow_ups:follow_ups (status, completed_at),
      quotations:quotations (status),
      lead_score_data:lead_scores (total_score, engagement_score, fit_score)
    `)
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    throw new Error('Lead not found')
  }

  let probability = 50 // Base probability
  const factors: Array<{ name: string; impact: number; reason: string }> = []

  // Factor 1: Lead Score (30% weight)
  const leadScore = (lead as any).lead_score || 0
  if (leadScore > 0) {
    const scoreImpact = (leadScore / 100) * 30
    probability += scoreImpact - 15 // Normalize around 50%
    factors.push({
      name: 'Lead Score',
      impact: scoreImpact - 15,
      reason: `Lead score of ${leadScore} indicates ${leadScore >= 70 ? 'high' : leadScore >= 50 ? 'medium' : 'low'} quality`,
    })
  }

  // Factor 2: Interest Level (20% weight)
  if (lead.interest_level === 'hot') {
    probability += 20
    factors.push({
      name: 'Interest Level',
      impact: 20,
      reason: 'Hot lead - high interest level',
    })
  } else if (lead.interest_level === 'warm') {
    probability += 10
    factors.push({
      name: 'Interest Level',
      impact: 10,
      reason: 'Warm lead - moderate interest',
    })
  } else if (lead.interest_level === 'cold') {
    probability -= 10
    factors.push({
      name: 'Interest Level',
      impact: -10,
      reason: 'Cold lead - low interest',
    })
  }

  // Factor 3: Engagement (15% weight)
  const calls = (lead as any).calls || []
  const connectedCalls = calls.filter((c: any) => c.outcome === 'connected').length
  if (connectedCalls >= 3) {
    probability += 15
    factors.push({
      name: 'Engagement',
      impact: 15,
      reason: `${connectedCalls} connected calls - high engagement`,
    })
  } else if (connectedCalls >= 2) {
    probability += 10
    factors.push({
      name: 'Engagement',
      impact: 10,
      reason: `${connectedCalls} connected calls - good engagement`,
    })
  } else if (connectedCalls === 1) {
    probability += 5
    factors.push({
      name: 'Engagement',
      impact: 5,
      reason: '1 connected call - initial engagement',
    })
  } else {
    probability -= 5
    factors.push({
      name: 'Engagement',
      impact: -5,
      reason: 'No connected calls - low engagement',
    })
  }

  // Factor 4: Quotation Status (15% weight)
  const quotations = (lead as any).quotations || []
  const acceptedQuotations = quotations.filter((q: any) => q.status === 'accepted').length
  const viewedQuotations = quotations.filter((q: any) => q.status === 'viewed').length

  if (acceptedQuotations > 0) {
    probability += 15
    factors.push({
      name: 'Quotation',
      impact: 15,
      reason: 'Quotation accepted - very positive signal',
    })
  } else if (viewedQuotations > 0) {
    probability += 10
    factors.push({
      name: 'Quotation',
      impact: 10,
      reason: 'Quotation viewed - positive engagement',
    })
  }

  // Factor 5: Current Status (10% weight)
  if (['negotiation', 'interested', 'quotation_accepted'].includes(lead.status)) {
    probability += 10
    factors.push({
      name: 'Status',
      impact: 10,
      reason: `Current status "${lead.status}" indicates progress`,
    })
  } else if (['new', 'unqualified'].includes(lead.status)) {
    probability -= 10
    factors.push({
      name: 'Status',
      impact: -10,
      reason: `Early stage status "${lead.status}" - needs qualification`,
    })
  }

  // Factor 6: Time in Pipeline (10% weight)
  const daysInPipeline =
    (new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
  if (daysInPipeline < 7) {
    probability += 5
    factors.push({
      name: 'Pipeline Velocity',
      impact: 5,
      reason: 'Fresh lead - recent entry',
    })
  } else if (daysInPipeline > 30) {
    probability -= 10
    factors.push({
      name: 'Pipeline Velocity',
      impact: -10,
      reason: `Lead in pipeline for ${Math.round(daysInPipeline)} days - may be going cold`,
    })
  }

  // Clamp probability to 0-100
  probability = Math.max(0, Math.min(100, probability))

  // Calculate confidence based on data completeness
  let confidence = 50
  if (lead.email && lead.phone) confidence += 10
  if (lead.requirement) confidence += 10
  if (lead.budget_range) confidence += 10
  if (calls.length > 0) confidence += 10
  if (quotations.length > 0) confidence += 10
  confidence = Math.min(100, confidence)

  return {
    leadId,
    probability: Math.round(probability * 100) / 100,
    factors,
    confidence: Math.round(confidence * 100) / 100,
  }
}

/**
 * Calculate churn risk for a lead
 */
export async function calculateChurnRisk(leadId: string): Promise<ChurnRisk> {
  const supabase = createServiceClient()

  // Get lead with activity data
  const { data: lead, error } = await supabase
    .from('leads')
    .select(`
      *,
      calls:calls (created_at, outcome),
      follow_ups:follow_ups (scheduled_at, status),
      lead_activities:lead_activities (performed_at)
    `)
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    throw new Error('Lead not found')
  }

  let riskScore = 0
  const factors: Array<{ name: string; impact: number; reason: string }> = []

  // Calculate days since last activity
  const activities = (lead as any).lead_activities || []
  const calls = (lead as any).calls || []
  const followUps = (lead as any).follow_ups || []

  let lastActivityDate: Date | null = null

  // Find most recent activity
  if (activities.length > 0) {
    const lastActivity = activities.sort(
      (a: any, b: any) =>
        new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
    )[0]
    lastActivityDate = new Date(lastActivity.performed_at)
  } else if (calls.length > 0) {
    const lastCall = calls.sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    lastActivityDate = new Date(lastCall.created_at)
  } else if (lead.first_contact_at) {
    lastActivityDate = new Date(lead.first_contact_at)
  } else {
    lastActivityDate = new Date(lead.created_at)
  }

  const daysSinceLastActivity =
    (new Date().getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)

  // Factor 1: Days since last activity (40% weight)
  if (daysSinceLastActivity > 14) {
    riskScore += 40
    factors.push({
      name: 'Inactivity',
      impact: 40,
      reason: `${Math.round(daysSinceLastActivity)} days since last activity - high risk`,
    })
  } else if (daysSinceLastActivity > 7) {
    riskScore += 25
    factors.push({
      name: 'Inactivity',
      impact: 25,
      reason: `${Math.round(daysSinceLastActivity)} days since last activity - medium risk`,
    })
  } else if (daysSinceLastActivity > 3) {
    riskScore += 10
    factors.push({
      name: 'Inactivity',
      impact: 10,
      reason: `${Math.round(daysSinceLastActivity)} days since last activity - low risk`,
    })
  }

  // Factor 2: No connected calls (20% weight)
  const connectedCalls = calls.filter((c: any) => c.outcome === 'connected').length
  if (connectedCalls === 0 && calls.length > 0) {
    riskScore += 20
    factors.push({
      name: 'No Engagement',
      impact: 20,
      reason: 'No successful calls despite attempts',
    })
  }

  // Factor 3: Status stagnation (20% weight)
  const daysInCurrentStatus =
    (new Date().getTime() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24)
  if (daysInCurrentStatus > 14 && ['new', 'qualified', 'quotation_shared'].includes(lead.status)) {
    riskScore += 20
    factors.push({
      name: 'Status Stagnation',
      impact: 20,
      reason: `Stuck in "${lead.status}" status for ${Math.round(daysInCurrentStatus)} days`,
    })
  }

  // Factor 4: Overdue follow-ups (10% weight)
  const now = new Date()
  const overdueFollowUps = followUps.filter(
    (f: any) => f.status === 'pending' && new Date(f.scheduled_at) < now
  ).length
  if (overdueFollowUps > 0) {
    riskScore += 10
    factors.push({
      name: 'Overdue Follow-ups',
      impact: 10,
      reason: `${overdueFollowUps} overdue follow-up(s)`,
    })
  }

  // Factor 5: Interest level (10% weight)
  if (lead.interest_level === 'cold') {
    riskScore += 10
    factors.push({
      name: 'Interest Level',
      impact: 10,
      reason: 'Cold lead - lower engagement expected',
    })
  }

  // Clamp risk score
  riskScore = Math.max(0, Math.min(100, riskScore))

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical'
  if (riskScore >= 70) {
    riskLevel = 'critical'
  } else if (riskScore >= 50) {
    riskLevel = 'high'
  } else if (riskScore >= 30) {
    riskLevel = 'medium'
  } else {
    riskLevel = 'low'
  }

  return {
    leadId,
    riskScore: Math.round(riskScore * 100) / 100,
    riskLevel,
    factors,
    daysSinceLastActivity: Math.round(daysSinceLastActivity * 100) / 100,
  }
}

/**
 * Predict best time to contact a lead
 */
export async function predictBestTimeToContact(leadId: string): Promise<BestTimeToContact> {
  const supabase = createServiceClient()

  // Get lead with call history
  const { data: lead, error } = await supabase
    .from('leads')
    .select(`
      *,
      calls:calls (created_at, outcome, call_duration)
    `)
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    throw new Error('Lead not found')
  }

  const calls = (lead as any).calls || []
  const connectedCalls = calls.filter((c: any) => c.outcome === 'connected')

  // Default recommendation: Next business day, 10 AM
  const now = new Date()
  const recommendedTime = new Date(now)
  recommendedTime.setDate(recommendedTime.getDate() + 1)
  recommendedTime.setHours(10, 0, 0, 0)

  let confidence = 30
  let reason = 'Default recommendation: Next business day at 10 AM'

  // If we have connected calls, analyze patterns
  if (connectedCalls.length > 0) {
    const callHours: number[] = []
    for (const call of connectedCalls) {
      const callDate = new Date(call.created_at)
      callHours.push(callDate.getHours())
    }

    // Find most common hour
    const hourCounts = new Map<number, number>()
    for (const hour of callHours) {
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
    }

    let bestHour = 10
    let maxCount = 0
    for (const [hour, count] of hourCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        bestHour = hour
      }
    }

    recommendedTime.setHours(bestHour, 0, 0, 0)
    confidence = Math.min(80, 30 + connectedCalls.length * 10)
    reason = `Based on ${connectedCalls.length} successful call(s), best time is ${bestHour}:00`
  } else if (calls.length > 0) {
    // If we have failed calls, try different time
    const lastCall = calls.sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    const lastCallHour = new Date(lastCall.created_at).getHours()

    // Try 2-3 hours after last attempt
    const nextHour = (lastCallHour + 3) % 24
    recommendedTime.setHours(nextHour, 0, 0, 0)
    confidence = 40
    reason = `Last call at ${lastCallHour}:00 was unsuccessful, try ${nextHour}:00`
  }

  return {
    leadId,
    recommendedTime: recommendedTime.toISOString(),
    confidence: Math.round(confidence * 100) / 100,
    reason,
  }
}

/**
 * Get predictive insights for a lead
 */
export async function getLeadPredictiveInsights(leadId: string) {
  const [winProbability, churnRisk, bestTime] = await Promise.all([
    calculateWinProbability(leadId),
    calculateChurnRisk(leadId),
    predictBestTimeToContact(leadId),
  ])

  return {
    winProbability,
    churnRisk,
    bestTimeToContact: bestTime,
  }
}

/**
 * Get leads at risk of churning
 */
export async function getAtRiskLeads(threshold: number = 50, limit: number = 50) {
  const supabase = createServiceClient()

  // Get active leads
  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .not('status', 'in', '(lost,discarded,fully_paid,converted)')
    .limit(limit * 2) // Get more to filter

  if (!leads || leads.length === 0) {
    return []
  }

  // Calculate churn risk for each
  const risks = await Promise.all(
    leads.map(async (lead) => {
      try {
        return await calculateChurnRisk(lead.id)
      } catch (error) {
        return null
      }
    })
  )

  // Filter and sort by risk score
  return risks
    .filter((r): r is ChurnRisk => r !== null && r.riskScore >= threshold)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit)
}
