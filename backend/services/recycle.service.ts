import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'
import { enrollLeadInCampaign } from './nurturing.service'

type RecycleRule = Database['public']['Tables']['lead_recycle_rules']['Row']
type RecycleHistory = Database['public']['Tables']['lead_recycle_history']['Row']

/**
 * Recycle a lead manually
 */
export async function recycleLead(
  leadId: string,
  recycledBy: string,
  newStatus: string = 'new',
  notes?: string
): Promise<void> {
  const supabase = createServiceClient()

  // Get current lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('status, recycle_count')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    throw new Error('Lead not found')
  }

  const oldStatus = lead.status
  const newRecycleCount = (lead.recycle_count || 0) + 1

  // Update lead
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      status: newStatus,
      recycle_count: newRecycleCount,
      last_recycled_at: new Date().toISOString(),
      is_recycled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (updateError) {
    throw new Error(`Failed to recycle lead: ${updateError.message}`)
  }

  // Log recycle history
  await supabase.from('lead_recycle_history').insert({
    lead_id: leadId,
    old_status: oldStatus,
    new_status: newStatus,
    recycle_count: newRecycleCount,
    recycled_by: recycledBy,
    notes: notes || 'Manually recycled',
  } as any)

  // Create status history entry
  await supabase.from('lead_status_history').insert({
    lead_id: leadId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: recycledBy,
    notes: `Lead recycled (${newRecycleCount} time${newRecycleCount > 1 ? 's' : ''})${notes ? ` - ${notes}` : ''}`,
  } as any)
}

/**
 * Process automatic lead recycling
 */
export async function processAutomaticRecycling(): Promise<number> {
  const supabase = createServiceClient()

  // Call database function to recycle eligible leads
  const { data: recycledCount, error } = await supabase.rpc('recycle_eligible_leads')

  if (error) {
    console.error('Failed to process automatic recycling:', error)
    return 0
  }

  // Get recycled leads and auto-enroll in campaigns if needed
  const { data: recycleHistory } = await supabase
    .from('lead_recycle_history')
    .select(`
      *,
      rule:lead_recycle_rules (
        auto_enroll_campaign_id
      )
    `)
    .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute

  if (recycleHistory) {
    for (const history of recycleHistory) {
      const rule = history.rule as any
      if (rule?.auto_enroll_campaign_id) {
        try {
          await enrollLeadInCampaign(history.lead_id, rule.auto_enroll_campaign_id)
        } catch (error) {
          console.error(`Failed to auto-enroll lead ${history.lead_id} in campaign:`, error)
        }
      }
    }
  }

  return recycledCount || 0
}

/**
 * Get recycle rules
 */
export async function getRecycleRules(filters?: { isActive?: boolean }) {
  const supabase = createServiceClient()

  let query = supabase.from('lead_recycle_rules').select('*').order('created_at', { ascending: false })

  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch recycle rules: ${error.message}`)
  }

  return data || []
}

/**
 * Create or update recycle rule
 */
export async function upsertRecycleRule(ruleData: {
  id?: string
  name: string
  description?: string
  triggerStatus: string[]
  recycleAfterDays: number
  maxRecycleCount: number
  newStatus: string
  autoEnrollCampaignId?: string | null
  isActive?: boolean
}) {
  const supabase = createServiceClient()

  const rule = {
    name: ruleData.name,
    description: ruleData.description || null,
    trigger_status: ruleData.triggerStatus,
    recycle_after_days: ruleData.recycleAfterDays,
    max_recycle_count: ruleData.maxRecycleCount,
    new_status: ruleData.newStatus,
    auto_enroll_campaign_id: ruleData.autoEnrollCampaignId || null,
    is_active: ruleData.isActive !== undefined ? ruleData.isActive : true,
    updated_at: new Date().toISOString(),
  }

  if (ruleData.id) {
    // Update existing
    const { data, error } = await supabase
      .from('lead_recycle_rules')
      .update(rule)
      .eq('id', ruleData.id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update recycle rule: ${error.message}`)
    }

    return data
  } else {
    // Create new
    const { data, error } = await supabase.from('lead_recycle_rules').insert(rule).select().single()

    if (error) {
      throw new Error(`Failed to create recycle rule: ${error.message}`)
    }

    return data
  }
}

/**
 * Get recycle history for a lead
 */
export async function getLeadRecycleHistory(leadId: string) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('lead_recycle_history')
    .select(`
      *,
      rule:lead_recycle_rules (
        id,
        name
      ),
      recycled_by_user:users (
        id,
        name
      )
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch recycle history: ${error.message}`)
  }

  return data || []
}

/**
 * Get leads eligible for recycling
 */
export async function getEligibleLeadsForRecycling(ruleId?: string) {
  const supabase = createServiceClient()

  let query = supabase.from('lead_recycle_rules').select('*').eq('is_active', true)

  if (ruleId) {
    query = query.eq('id', ruleId)
  }

  const { data: rules } = await query

  if (!rules || rules.length === 0) {
    return []
  }

  const eligibleLeads: Array<{
    leadId: string
    currentStatus: string
    daysSinceStatusChange: number
    recycleCount: number
    ruleId: string
    ruleName: string
  }> = []

  for (const rule of rules) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - rule.recycle_after_days)

    // Get leads matching this rule
    const { data: leads } = await supabase
      .from('leads')
      .select('id, status, updated_at, recycle_count')
      .contains('status', rule.trigger_status)
      .or(`last_recycled_at.is.null,last_recycled_at.lte.${cutoffDate.toISOString()}`)
      .or(`recycle_count.is.null,recycle_count.lt.${rule.max_recycle_count}`)
      .eq('is_recycled', false)
      .limit(100)

    if (leads) {
      for (const lead of leads) {
        const daysSinceStatusChange =
          (new Date().getTime() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24)

        eligibleLeads.push({
          leadId: lead.id,
          currentStatus: lead.status,
          daysSinceStatusChange: Math.round(daysSinceStatusChange),
          recycleCount: lead.recycle_count || 0,
          ruleId: rule.id,
          ruleName: rule.name,
        })
      }
    }
  }

  return eligibleLeads
}
