import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type SLARule = Database['public']['Tables']['sla_rules']['Row']
type SLAViolation = Database['public']['Tables']['sla_violations']['Row']
type Lead = Database['public']['Tables']['leads']['Row']

export interface SLAViolationCheck {
  hasViolation: boolean
  violationType?: 'first_contact' | 'qualification' | 'followup_response' | 'quotation_delivery'
  minutesOverdue?: number
  deadline?: string
}

/**
 * Get the applicable SLA rule for a lead based on source, interest level, and status
 */
export async function getApplicableSLARule(
  leadSource: string,
  interestLevel: string | null,
  leadStatus: string
): Promise<SLARule | null> {
  const supabase = createServiceClient()

  // Build query to find matching rule
  let query = supabase
    .from('sla_rules')
    .select('*')
    .eq('is_active', true)
    .or(`lead_source.eq.${leadSource},lead_source.eq.all`)

  const { data: rules, error } = await query

  if (error || !rules || rules.length === 0) {
    return null
  }

  // Filter by interest level and status, then sort by priority
  const matchingRules = rules
    .filter((rule) => {
      const interestMatch =
        rule.interest_level === 'all' ||
        rule.interest_level === interestLevel ||
        (rule.interest_level === null && interestLevel === null)

      const statusMatch = rule.lead_status === null || rule.lead_status === leadStatus

      return interestMatch && statusMatch
    })
    .sort((a, b) => {
      // Sort by priority (higher first), then by creation date
      if (b.priority !== a.priority) {
        return b.priority - a.priority
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

  return matchingRules.length > 0 ? (matchingRules[0] as SLARule) : null
}

/**
 * Apply SLA rule to a lead and set deadlines
 */
export async function applySLARuleToLead(leadId: string): Promise<void> {
  const supabase = createServiceClient()

  // Get lead details
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('source, interest_level, status')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    throw new Error('Lead not found')
  }

  // Get applicable SLA rule
  const rule = await getApplicableSLARule(
    lead.source,
    lead.interest_level,
    lead.status
  )

  if (!rule) {
    return // No rule to apply
  }

  const now = new Date()
  const updates: any = {
    sla_rule_id: rule.id,
  }

  // Calculate first contact deadline
  if (rule.first_contact_minutes) {
    const firstContactDeadline = new Date(now.getTime() + rule.first_contact_minutes * 60 * 1000)
    updates.sla_first_contact_deadline = firstContactDeadline.toISOString()
  }

  // Calculate qualification deadline
  if (rule.qualification_hours) {
    const qualificationDeadline = new Date(now.getTime() + rule.qualification_hours * 60 * 60 * 1000)
    updates.sla_qualification_deadline = qualificationDeadline.toISOString()
  }

  // Update lead with SLA deadlines
  const { error: updateError } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)

  if (updateError) {
    throw new Error(`Failed to apply SLA rule: ${updateError.message}`)
  }
}

/**
 * Check if a lead has violated SLA
 */
export async function checkSLAViolation(leadId: string): Promise<SLAViolationCheck> {
  const supabase = createServiceClient()
  const now = new Date()

  // Get lead with SLA deadlines
  const { data: lead, error } = await supabase
    .from('leads')
    .select('sla_first_contact_deadline, sla_qualification_deadline, first_contact_at, status')
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    return { hasViolation: false }
  }

  // Check first contact violation
  if (lead.sla_first_contact_deadline && !lead.first_contact_at) {
    const deadline = new Date(lead.sla_first_contact_deadline)
    if (now > deadline) {
      const minutesOverdue = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60))
      return {
        hasViolation: true,
        violationType: 'first_contact',
        minutesOverdue,
        deadline: deadline.toISOString(),
      }
    }
  }

  // Check qualification violation
  if (lead.sla_qualification_deadline && lead.status === 'new') {
    const deadline = new Date(lead.sla_qualification_deadline)
    if (now > deadline) {
      const minutesOverdue = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60))
      return {
        hasViolation: true,
        violationType: 'qualification',
        minutesOverdue,
        deadline: deadline.toISOString(),
      }
    }
  }

  return { hasViolation: false }
}

/**
 * Get all active SLA violations
 */
export async function getActiveSLAViolations(filters?: {
  leadId?: string
  violationType?: string
  escalationLevel?: number
  limit?: number
  offset?: number
}) {
  const supabase = createServiceClient()

  let query = supabase
    .from('sla_violations')
    .select(`
      *,
      lead:leads (
        id,
        lead_id,
        name,
        phone,
        status,
        assigned_to
      ),
      sla_rule:sla_rules (
        id,
        name,
        description
      )
    `)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })

  if (filters?.leadId) {
    query = query.eq('lead_id', filters.leadId)
  }

  if (filters?.violationType) {
    query = query.eq('violation_type', filters.violationType)
  }

  if (filters?.escalationLevel !== undefined) {
    query = query.eq('escalation_level', filters.escalationLevel)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch SLA violations: ${error.message}`)
  }

  return data || []
}

/**
 * Resolve an SLA violation
 */
export async function resolveSLAViolation(
  violationId: string,
  resolvedBy: string,
  notes?: string
): Promise<void> {
  const supabase = createServiceClient()

  // Get violation to check if it's already resolved
  const { data: violation, error: fetchError } = await supabase
    .from('sla_violations')
    .select('lead_id, violation_type, resolved_at')
    .eq('id', violationId)
    .single()

  if (fetchError || !violation) {
    throw new Error('SLA violation not found')
  }

  if (violation.resolved_at) {
    throw new Error('SLA violation already resolved')
  }

  // Resolve the violation
  const { error: updateError } = await supabase
    .from('sla_violations')
    .update({
      resolved_at: new Date().toISOString(),
      actual_time: new Date().toISOString(),
      resolved_by: resolvedBy,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', violationId)

  if (updateError) {
    throw new Error(`Failed to resolve SLA violation: ${updateError.message}`)
  }

  // Check if lead has any remaining violations
  const { data: remainingViolations } = await supabase
    .from('sla_violations')
    .select('id')
    .eq('lead_id', violation.lead_id)
    .is('resolved_at', null)
    .limit(1)

  // Update lead flag
  await supabase
    .from('leads')
    .update({
      has_active_sla_violation: (remainingViolations?.length || 0) > 0,
    })
    .eq('id', violation.lead_id)
}

/**
 * Escalate an SLA violation
 */
export async function escalateSLAViolation(
  violationId: string,
  escalationLevel: number,
  escalatedTo: string,
  actionTaken: string,
  notes?: string
): Promise<void> {
  const supabase = createServiceClient()

  // Get violation
  const { data: violation, error: fetchError } = await supabase
    .from('sla_violations')
    .select('id, escalation_level')
    .eq('id', violationId)
    .single()

  if (fetchError || !violation) {
    throw new Error('SLA violation not found')
  }

  // Update violation escalation level
  const { error: updateError } = await supabase
    .from('sla_violations')
    .update({
      escalation_level: escalationLevel,
      escalated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', violationId)

  if (updateError) {
    throw new Error(`Failed to escalate SLA violation: ${updateError.message}`)
  }

  // Log escalation
  await supabase.from('sla_escalations').insert({
    violation_id: violationId,
    escalation_level: escalationLevel,
    escalated_to: escalatedTo,
    action_taken: actionTaken,
    notes: notes || null,
  } as any)
}

/**
 * Process automatic SLA escalation based on violation duration
 */
export async function processAutomaticEscalation(): Promise<void> {
  const supabase = createServiceClient()

  // Get violations that need escalation
  const { data: violations, error } = await supabase
    .from('sla_violations')
    .select(`
      *,
      lead:leads (
        id,
        assigned_to
      )
    `)
    .is('resolved_at', null)
    .order('created_at', { ascending: true })

  if (error || !violations) {
    console.error('Failed to fetch violations for escalation:', error)
    return
  }

  for (const violation of violations) {
    const lead = violation.lead as any
    if (!lead) continue

    const violationAge = violation.violation_duration_minutes || 0
    let newEscalationLevel = violation.escalation_level || 0
    let actionTaken = ''

    // Level 1: Alert assigned rep (on breach - 0 minutes overdue)
    if (newEscalationLevel === 0 && violationAge >= 0) {
      newEscalationLevel = 1
      actionTaken = 'alerted'
      // In a real system, you'd send notification here
    }

    // Level 2: Notify supervisor (5 minutes after breach)
    if (newEscalationLevel === 1 && violationAge >= 5) {
      newEscalationLevel = 2
      actionTaken = 'supervisor_notified'
      // Get supervisor - in real system, get from user hierarchy
      // For now, we'll just escalate the level
    }

    // Level 3: Auto-reassign to available rep (10 minutes after breach)
    if (newEscalationLevel === 2 && violationAge >= 10) {
      newEscalationLevel = 3
      actionTaken = 'auto_reassigned'
      // Auto-reassign logic would go here
      // For now, we'll just mark it for reassignment
    }

    // Update escalation if needed
    if (newEscalationLevel > violation.escalation_level) {
      await escalateSLAViolation(
        violation.id,
        newEscalationLevel,
        lead.assigned_to || violation.id, // Fallback to violation ID if no assigned user
        actionTaken,
        `Automatic escalation after ${violationAge} minutes`
      )
    }
  }
}

/**
 * Run SLA violation check for all leads (background job)
 */
export async function checkAllSLAViolations(): Promise<number> {
  const supabase = createServiceClient()

  // Call the database function to check violations
  const { error } = await supabase.rpc('check_sla_violations')

  if (error) {
    console.error('Failed to check SLA violations:', error)
    return 0
  }

  // Get count of new violations created
  const { count } = await supabase
    .from('sla_violations')
    .select('*', { count: 'exact', head: true })
    .is('resolved_at', null)
    .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute

  return count || 0
}

/**
 * Get SLA rules
 */
export async function getSLARules(filters?: { isActive?: boolean }) {
  const supabase = createServiceClient()

  let query = supabase.from('sla_rules').select('*').order('priority', { ascending: false })

  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch SLA rules: ${error.message}`)
  }

  return data || []
}

/**
 * Create or update SLA rule
 */
export async function upsertSLARule(ruleData: {
  id?: string
  name: string
  description?: string
  lead_source: string
  interest_level?: string | null
  lead_status?: string | null
  priority: number
  first_contact_minutes: number
  qualification_hours?: number | null
  followup_response_hours?: number | null
  quotation_delivery_hours?: number | null
  is_active?: boolean
}) {
  const supabase = createServiceClient()

  const rule = {
    ...ruleData,
    updated_at: new Date().toISOString(),
  }

  if (ruleData.id) {
    // Update existing
    const { data, error } = await supabase
      .from('sla_rules')
      .update(rule)
      .eq('id', ruleData.id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update SLA rule: ${error.message}`)
    }

    return data
  } else {
    // Create new
    const { data, error } = await supabase.from('sla_rules').insert(rule).select().single()

    if (error) {
      throw new Error(`Failed to create SLA rule: ${error.message}`)
    }

    return data
  }
}
