import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type Lead = Database['public']['Tables']['leads']['Row']
type LeadScore = Database['public']['Tables']['lead_scores']['Row']

export interface ScoreBreakdown {
  total: number
  demographic: number
  engagement: number
  fit: number
  source: number
  factors: Array<{
    type: string
    name: string
    value: string
    score: number
    weight: number
  }>
}

/**
 * Calculate demographic score based on lead profile
 */
async function calculateDemographicScore(lead: Lead): Promise<{
  score: number
  factors: Array<{ name: string; value: string; score: number; weight: number }>
}> {
  let score = 0
  const factors: Array<{ name: string; value: string; score: number; weight: number }> = []

  // Email presence (10 points)
  if (lead.email && lead.email.trim() !== '') {
    score += 10
    factors.push({
      name: 'email_presence',
      value: 'has_email',
      score: 10,
      weight: 1.0,
    })
  }

  // Phone presence (10 points)
  if (lead.phone && lead.phone.trim() !== '') {
    score += 10
    factors.push({
      name: 'phone_presence',
      value: 'has_phone',
      score: 10,
      weight: 1.0,
    })
  }

  // Name completeness (5 points)
  if (lead.name && lead.name.trim().length >= 3) {
    score += 5
    factors.push({
      name: 'name_completeness',
      value: 'has_name',
      score: 5,
      weight: 1.0,
    })
  }

  // Job title from meta_data (if available) - 15 points
  if (lead.meta_data) {
    const jobTitle = lead.meta_data['job_title'] || lead.meta_data['position'] || lead.meta_data['designation']
    if (jobTitle) {
      const jobTitleStr = String(jobTitle).toLowerCase()
      let jobScore = 5 // Base score

      // Higher scores for decision-making roles
      if (jobTitleStr.includes('ceo') || jobTitleStr.includes('founder') || jobTitleStr.includes('owner')) {
        jobScore = 15
      } else if (
        jobTitleStr.includes('director') ||
        jobTitleStr.includes('manager') ||
        jobTitleStr.includes('head')
      ) {
        jobScore = 12
      } else if (jobTitleStr.includes('executive') || jobTitleStr.includes('vp')) {
        jobScore = 10
      }

      score += jobScore
      factors.push({
        name: 'job_title',
        value: String(jobTitle),
        score: jobScore,
        weight: 1.0,
      })
    }

    // Company size from meta_data - 10 points
    const companySize = lead.meta_data['company_size'] || lead.meta_data['employees']
    if (companySize) {
      const sizeStr = String(companySize).toLowerCase()
      let sizeScore = 5

      if (sizeStr.includes('1000+') || sizeStr.includes('1000')) {
        sizeScore = 10
      } else if (sizeStr.includes('500') || sizeStr.includes('500+')) {
        sizeScore = 8
      } else if (sizeStr.includes('100') || sizeStr.includes('100+')) {
        sizeScore = 6
      }

      score += sizeScore
      factors.push({
        name: 'company_size',
        value: String(companySize),
        score: sizeScore,
        weight: 1.0,
      })
    }
  }

  // Normalize to 0-100 scale (max possible is ~60 for basic fields)
  const normalizedScore = Math.min(100, (score / 60) * 100)

  return { score: Math.round(normalizedScore * 100) / 100, factors }
}

/**
 * Calculate engagement score based on interactions
 */
async function calculateEngagementScore(leadId: string): Promise<{
  score: number
  factors: Array<{ name: string; value: string; score: number; weight: number }>
}> {
  const supabase = createServiceClient()
  let score = 0
  const factors: Array<{ name: string; value: string; score: number; weight: number }> = []

  // Count calls
  const { data: calls } = await supabase
    .from('calls')
    .select('outcome, call_duration')
    .eq('lead_id', leadId)

  if (calls) {
    const totalCalls = calls.length
    const connectedCalls = calls.filter((c) => c.outcome === 'connected').length

    // First contact made: 20 points
    if (totalCalls > 0) {
      score += 20
      factors.push({
        name: 'first_contact',
        value: 'contacted',
        score: 20,
        weight: 1.0,
      })
    }

    // Each connected call: 15 points (max 45 for 3+ calls)
    const connectedScore = Math.min(45, connectedCalls * 15)
    if (connectedScore > 0) {
      score += connectedScore
      factors.push({
        name: 'connected_calls',
        value: `${connectedCalls} calls`,
        score: connectedScore,
        weight: 1.0,
      })
    }

    // Long calls (>5 minutes): 10 points each
    const longCalls = calls.filter((c) => c.call_duration && c.call_duration > 300).length
    if (longCalls > 0) {
      const longCallScore = Math.min(20, longCalls * 10)
      score += longCallScore
      factors.push({
        name: 'long_calls',
        value: `${longCalls} long calls`,
        score: longCallScore,
        weight: 1.0,
      })
    }
  }

  // Count completed follow-ups
  const { data: followUps } = await supabase
    .from('follow_ups')
    .select('status')
    .eq('lead_id', leadId)

  if (followUps) {
    const completedFollowUps = followUps.filter((f) => f.status === 'done').length
    if (completedFollowUps > 0) {
      const followUpScore = Math.min(20, completedFollowUps * 10)
      score += followUpScore
      factors.push({
        name: 'completed_followups',
        value: `${completedFollowUps} follow-ups`,
        score: followUpScore,
        weight: 1.0,
      })
    }
  }

  // Check if quotation was viewed
  const { data: quotations } = await supabase
    .from('quotations')
    .select('status')
    .eq('lead_id', leadId)

  if (quotations) {
    const viewedQuotations = quotations.filter((q) => q.status === 'viewed' || q.status === 'accepted').length
    if (viewedQuotations > 0) {
      score += 15
      factors.push({
        name: 'quotation_engagement',
        value: 'quotation_viewed',
        score: 15,
        weight: 1.0,
      })
    }
  }

  return { score: Math.min(100, score), factors }
}

/**
 * Calculate fit score based on requirements and budget
 */
async function calculateFitScore(lead: Lead): Promise<{
  score: number
  factors: Array<{ name: string; value: string; score: number; weight: number }>
}> {
  let score = 0
  const factors: Array<{ name: string; value: string; score: number; weight: number }> = []

  // Interest level scoring
  if (lead.interest_level === 'hot') {
    score += 40
    factors.push({
      name: 'interest_level',
      value: 'hot',
      score: 40,
      weight: 1.0,
    })
  } else if (lead.interest_level === 'warm') {
    score += 25
    factors.push({
      name: 'interest_level',
      value: 'warm',
      score: 25,
      weight: 1.0,
    })
  } else if (lead.interest_level === 'cold') {
    score += 10
    factors.push({
      name: 'interest_level',
      value: 'cold',
      score: 10,
      weight: 1.0,
    })
  }

  // Budget range presence (20 points)
  if (lead.budget_range && lead.budget_range.trim() !== '') {
    score += 20
    factors.push({
      name: 'budget_range',
      value: lead.budget_range,
      score: 20,
      weight: 1.0,
    })
  }

  // Timeline presence (20 points)
  if (lead.timeline && lead.timeline.trim() !== '') {
    score += 20
    factors.push({
      name: 'timeline',
      value: lead.timeline,
      score: 20,
      weight: 1.0,
    })
  }

  // Requirement presence (20 points)
  if (lead.requirement && lead.requirement.trim() !== '') {
    score += 20
    factors.push({
      name: 'requirement',
      value: lead.requirement,
      score: 20,
      weight: 1.0,
    })
  }

  return { score: Math.min(100, score), factors }
}

/**
 * Calculate source score based on historical conversion rate
 */
async function calculateSourceScore(source: string): Promise<{
  score: number
  factors: Array<{ name: string; value: string; score: number; weight: number }>
}> {
  const supabase = createServiceClient()
  const factors: Array<{ name: string; value: string; score: number; weight: number }> = []

  // Get leads from this source in last 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: leads } = await supabase
    .from('leads')
    .select('status')
    .eq('source', source)
    .gte('created_at', ninetyDaysAgo.toISOString())

  if (!leads || leads.length === 0) {
    // Default score for new sources
    return {
      score: 50,
      factors: [
        {
          name: 'source_conversion',
          value: 'new_source',
          score: 50,
          weight: 1.0,
        },
      ],
    }
  }

  const totalLeads = leads.length
  const convertedLeads = leads.filter((l) =>
    ['converted', 'deal_won', 'fully_paid'].includes(l.status)
  ).length

  const conversionRate = (convertedLeads / totalLeads) * 100

  // Convert to 0-100 score
  // 0% conversion = 0 points, 30%+ conversion = 100 points
  let score = Math.min(100, (conversionRate / 30.0) * 100)
  score = Math.max(0, score)

  factors.push({
    name: 'source_conversion',
    value: `${conversionRate.toFixed(1)}% (${convertedLeads}/${totalLeads})`,
    score: Math.round(score * 100) / 100,
    weight: 1.0,
  })

  return { score: Math.round(score * 100) / 100, factors }
}

/**
 * Calculate total lead score
 */
export async function calculateLeadScore(leadId: string): Promise<ScoreBreakdown> {
  const supabase = createServiceClient()

  // Get lead
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    throw new Error('Lead not found')
  }

  // Calculate component scores
  const demographic = await calculateDemographicScore(lead)
  const engagement = await calculateEngagementScore(leadId)
  const fit = await calculateFitScore(lead)
  const source = await calculateSourceScore(lead.source)

  // Weighted total: demographic (20%), engagement (30%), fit (25%), source (25%)
  const total =
    demographic.score * 0.2 +
    engagement.score * 0.3 +
    fit.score * 0.25 +
    source.score * 0.25

  const breakdown: ScoreBreakdown = {
    total: Math.round(total * 100) / 100,
    demographic: demographic.score,
    engagement: engagement.score,
    fit: fit.score,
    source: source.score,
    factors: [
      ...demographic.factors.map((f) => ({ ...f, type: 'demographic' })),
      ...engagement.factors.map((f) => ({ ...f, type: 'engagement' })),
      ...fit.factors.map((f) => ({ ...f, type: 'fit' })),
      ...source.factors.map((f) => ({ ...f, type: 'source' })),
    ],
  }

  // Save score to database
  await saveLeadScore(leadId, breakdown)

  return breakdown
}

/**
 * Save lead score to database
 */
async function saveLeadScore(leadId: string, breakdown: ScoreBreakdown): Promise<void> {
  const supabase = createServiceClient()

  // Upsert score
  const { error: scoreError } = await supabase.from('lead_scores').upsert(
    {
      lead_id: leadId,
      total_score: breakdown.total,
      demographic_score: breakdown.demographic,
      engagement_score: breakdown.engagement,
      fit_score: breakdown.fit,
      source_score: breakdown.source,
      last_calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'lead_id',
    }
  )

  if (scoreError) {
    console.error('Failed to save lead score:', scoreError)
    return
  }

  // Save score factors
  const { data: scoreRecord } = await supabase
    .from('lead_scores')
    .select('id')
    .eq('lead_id', leadId)
    .single()

  if (scoreRecord) {
    // Delete old factors
    await supabase.from('score_factors').delete().eq('lead_score_id', scoreRecord.id)

    // Insert new factors
    if (breakdown.factors.length > 0) {
      const factorsToInsert = breakdown.factors.map((factor) => ({
        lead_score_id: scoreRecord.id,
        factor_type: factor.type,
        factor_name: factor.name,
        factor_value: factor.value,
        factor_score: factor.score,
        weight: factor.weight,
      }))

      await supabase.from('score_factors').insert(factorsToInsert)
    }
  }

  // Update lead table
  await supabase
    .from('leads')
    .update({
      lead_score: breakdown.total,
      score_last_updated: new Date().toISOString(),
    })
    .eq('id', leadId)
}

/**
 * Get lead score breakdown
 */
export async function getLeadScore(leadId: string): Promise<ScoreBreakdown | null> {
  const supabase = createServiceClient()

  const { data: score, error } = await supabase
    .from('lead_scores')
    .select(`
      *,
      factors:score_factors (*)
    `)
    .eq('lead_id', leadId)
    .single()

  if (error || !score) {
    return null
  }

  const factors = (score.factors as any[]) || []

  return {
    total: score.total_score,
    demographic: score.demographic_score,
    engagement: score.engagement_score,
    fit: score.fit_score,
    source: score.source_score,
    factors: factors.map((f) => ({
      type: f.factor_type,
      name: f.factor_name,
      value: f.factor_value || '',
      score: f.factor_score,
      weight: f.weight,
    })),
  }
}

/**
 * Recalculate score for a lead (triggers on activity)
 */
export async function recalculateLeadScore(leadId: string): Promise<ScoreBreakdown> {
  return calculateLeadScore(leadId)
}

/**
 * Apply score decay for inactive leads
 */
export async function applyScoreDecay(): Promise<number> {
  const supabase = createServiceClient()

  // Call database function to apply decay
  const { error } = await supabase.rpc('apply_score_decay')

  if (error) {
    console.error('Failed to apply score decay:', error)
    return 0
  }

  // Get count of leads with decay applied
  const { count } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('lead_score', 'is', null)
    .lt('score_last_updated', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  return count || 0
}

/**
 * Get leads sorted by score
 */
export async function getLeadsByScore(filters?: {
  minScore?: number
  maxScore?: number
  limit?: number
  offset?: number
}) {
  const supabase = createServiceClient()

  let query = supabase
    .from('leads')
    .select(`
      *,
      lead_score_data:lead_scores (*)
    `)
    .not('lead_score', 'is', null)
    .order('lead_score', { ascending: false })

  if (filters?.minScore !== undefined) {
    query = query.gte('lead_score', filters.minScore)
  }

  if (filters?.maxScore !== undefined) {
    query = query.lte('lead_score', filters.maxScore)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch leads by score: ${error.message}`)
  }

  return data || []
}
