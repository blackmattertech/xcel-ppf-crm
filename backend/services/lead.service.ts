import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'
import { assignLeadRoundRobin } from './assignment.service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'
import { applySLARuleToLead, resolveSLAViolation } from './sla.service'
import { checkForDuplicatesBeforeCreate } from './duplicate-detection.service'
import { cleanLeadData } from './enrichment.service'
import { calculateLeadScore } from './scoring.service'

type Lead = Database['public']['Tables']['leads']['Row']
type LeadInsert = Database['public']['Tables']['leads']['Insert']

export async function getAllLeads(filters?: {
  status?: string
  source?: string
  assignedTo?: string
  limit?: number
  offset?: number
  userId?: string // Current user ID for role-based filtering
  userRole?: string // Current user role for role-based filtering
}) {
  const supabase = createServiceClient()

  let query = supabase
    .from('leads')
    .select(`
      *,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name,
        email,
        profile_image_url
      )
    `)
    .order('created_at', { ascending: false })

  // Exclude leads with FULLY_PAID status
  query = query.neq('status', LEAD_STATUS.FULLY_PAID)

  // Role-based filtering: tele_callers can only see their assigned leads
  if (filters?.userRole === 'tele_caller' && filters?.userId) {
    query = query.eq('assigned_to', filters.userId)
  }

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.source) {
    query = query.eq('source', filters.source)
  }

  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch leads: ${error.message}`)
  }

  return data || []
}

export async function getLeadById(id: string, userId?: string, userRole?: string) {
  const supabase = createServiceClient()

  let query = supabase
    .from('leads')
    .select(`
      *,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name,
        email,
        profile_image_url
      ),
      status_history:lead_status_history (
        *,
        changed_by_user:users!lead_status_history_changed_by_fkey (
          id,
          name
        )
      ),
      calls:calls (
        *,
        called_by_user:users!calls_called_by_fkey (
          id,
          name
        )
      ),
      follow_ups:follow_ups (
        *,
        assigned_user:users!follow_ups_assigned_to_fkey (
          id,
          name
        )
      )
    `)
    .eq('id', id)

  const { data, error } = await query.single()

  if (error) {
    // Check if it's a not found error or permission error
    if (error.code === 'PGRST116') {
      throw new Error('Lead not found')
    }
    throw new Error(`Failed to fetch lead: ${error.message}`)
  }

  if (!data) {
    throw new Error('Lead not found')
  }

  // Additional check: if tele_caller and lead is not assigned to them, throw error
  if (userRole === 'tele_caller' && userId && (data as any).assigned_to !== userId) {
    throw new Error('Forbidden: You can only view leads assigned to you')
  }

  return data
}

export async function createLead(leadData: LeadInsert, autoAssign: boolean = true) {
  const supabase = createServiceClient()

  // Check for duplicates using advanced detection
  const duplicateCheck = await checkForDuplicatesBeforeCreate(leadData)
  if (duplicateCheck.isDuplicate && duplicateCheck.duplicateLead) {
    // Update existing lead instead of creating duplicate
    return updateLead(duplicateCheck.duplicateLead.id, {
      ...leadData,
      status: leadData.status || 'new',
    } as Partial<LeadInsert>)
  }

  // Clean and enrich lead data
  const { cleaned, enrichment, warnings } = await cleanLeadData(leadData)
  
  // Log warnings if any
  if (warnings.length > 0) {
    console.warn('Lead data warnings:', warnings)
  }

  // Use cleaned data for insertion
  const enrichedLeadData = {
    ...cleaned,
    ...leadData, // Keep original data for fields not cleaned
  }

  // Auto-assign if enabled
  if (autoAssign && enrichedLeadData.source && !enrichedLeadData.assigned_to) {
    // Calculate score first to determine priority
    let leadScore = 0
    try {
      const tempLead = { ...enrichedLeadData, id: 'temp' } as any
      // Quick score estimation before full calculation
      if (enrichedLeadData.interest_level === 'hot') {
        leadScore = 85
      } else if (enrichedLeadData.interest_level === 'warm') {
        leadScore = 60
      } else if (enrichedLeadData.interest_level === 'cold') {
        leadScore = 30
      } else {
        leadScore = 50 // Default
      }
    } catch (e) {
      // Ignore
    }

    // Note: leadId will be available after insert, but we can't use it here
    // Skill-based routing will happen on lead update if territory/industry/language is added
    const assignedUserId = await assignLeadRoundRobin(
      enrichedLeadData.source as 'meta' | 'manual' | 'form',
      {
        leadScore,
        priority: leadScore >= 80 ? 'high' : leadScore >= 60 ? 'normal' : 'low',
        interestLevel: enrichedLeadData.interest_level as 'hot' | 'warm' | 'cold' | undefined,
      }
    )
    if (assignedUserId) {
      enrichedLeadData.assigned_to = assignedUserId
    }
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      ...enrichedLeadData,
      status: enrichedLeadData.status || LEAD_STATUS.NEW,
    } as any)
    .select(`
      *,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name,
        email,
        profile_image_url
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to create lead: ${error.message}`)
  }

  // Create initial status history entry
  // Only create if we have a valid user ID for changed_by
  const createdLead = data as any
  if (createdLead.assigned_to) {
    // Only insert status history if we have a valid assigned user
    // The trigger will handle status changes, so we can skip initial entry if no user assigned
    try {
      await supabase.from('lead_status_history').insert({
        lead_id: createdLead.id,
        old_status: null,
        new_status: createdLead.status,
        changed_by: createdLead.assigned_to,
      } as any)
    } catch (historyError) {
      // Log but don't fail the lead creation if status history fails
      console.error('Failed to create status history:', historyError)
    }
  }

  // Apply SLA rule to the new lead
  try {
    await applySLARuleToLead(createdLead.id)
  } catch (slaError) {
    // Log but don't fail the lead creation if SLA application fails
    console.error('Failed to apply SLA rule:', slaError)
  }

  // Calculate initial lead score
  try {
    await calculateLeadScore(createdLead.id)
  } catch (scoreError) {
    // Log but don't fail the lead creation if scoring fails
    console.error('Failed to calculate lead score:', scoreError)
  }

  return data
}

/**
 * Batch create leads - much faster than individual creates
 * Returns array of created leads and array of errors
 */
export async function createLeadsBatch(
  leadsData: LeadInsert[],
  autoAssign: boolean = true,
  currentUserId: string | null = null
): Promise<{ success: any[]; failed: Array<{ index: number; data: LeadInsert; error: string }> }> {
  const supabase = createServiceClient()
  const results = {
    success: [] as any[],
    failed: [] as Array<{ index: number; data: LeadInsert; error: string }>,
  }

  if (leadsData.length === 0) {
    return results
  }

  // Get existing phones to check for duplicates
  const phones = leadsData.map(lead => lead.phone).filter(Boolean)
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('phone, id')
    .in('phone', phones)

  const existingPhones = new Set(existingLeads?.map(l => l.phone) || [])

  // Separate new leads from duplicates
  const newLeads: LeadInsert[] = []
  const duplicateMap = new Map<string, { index: number; data: LeadInsert; existingId: string }>()

  leadsData.forEach((lead, index) => {
    if (lead.phone && existingPhones.has(lead.phone)) {
      const existing = existingLeads?.find(l => l.phone === lead.phone)
      if (existing) {
        duplicateMap.set(lead.phone, { index, data: lead, existingId: existing.id })
      }
    } else {
      newLeads.push(lead)
    }
  })

  // Auto-assign new leads in batch
  if (autoAssign && newLeads.length > 0) {
    const sourceCounts = new Map<string, number>()
    newLeads.forEach(lead => {
      if (lead.source && !lead.assigned_to) {
        sourceCounts.set(lead.source, (sourceCounts.get(lead.source) || 0) + 1)
      }
    })

    // Get assignments for each source
    const assignmentPromises = Array.from(sourceCounts.keys()).map(async (source) => {
      const count = sourceCounts.get(source) || 0
      const assignments: string[] = []
      for (let i = 0; i < count; i++) {
        const userId = await assignLeadRoundRobin(source as 'meta' | 'manual' | 'form')
        if (userId) assignments.push(userId)
      }
      return { source, assignments }
    })

    const assignments = await Promise.all(assignmentPromises)
    const assignmentMap = new Map<string, string[]>()
    assignments.forEach(({ source, assignments: userAssignments }) => {
      assignmentMap.set(source, userAssignments)
    })

    // Assign users to leads
    const sourceIndices = new Map<string, number>()
    newLeads.forEach(lead => {
      if (lead.source && !lead.assigned_to) {
        const source = lead.source
        const index = sourceIndices.get(source) || 0
        const userAssignments = assignmentMap.get(source) || []
        if (userAssignments[index]) {
          lead.assigned_to = userAssignments[index]
          sourceIndices.set(source, index + 1)
        }
      }
    })
  }

  // Batch insert new leads
  if (newLeads.length > 0) {
    const leadsToInsert = newLeads.map(lead => ({
      ...lead,
      status: lead.status || LEAD_STATUS.NEW,
    }))

    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(leadsToInsert as any)
      .select(`
        *,
        assigned_user:users!leads_assigned_to_fkey (
          id,
          name,
          email
        )
      `)

    if (insertError) {
      // If batch insert fails, add all to failed
      newLeads.forEach((lead, idx) => {
        results.failed.push({
          index: leadsData.indexOf(lead),
          data: lead,
          error: insertError.message,
        })
      })
    } else {
      // Add successful inserts
      if (insertedLeads) {
        results.success.push(...insertedLeads)

        // Create status history entries in batch if we have user ID
        if (currentUserId && insertedLeads.length > 0) {
          const historyEntries = insertedLeads
            .filter((lead: any) => lead.assigned_to)
            .map((lead: any) => ({
              lead_id: lead.id,
              old_status: null,
              new_status: lead.status || LEAD_STATUS.NEW,
              changed_by: currentUserId,
            }))

          if (historyEntries.length > 0) {
            try {
              await supabase.from('lead_status_history').insert(historyEntries as any)
            } catch (historyError) {
              // Log but don't fail - leads were created successfully
              console.error('Failed to create status history batch:', historyError)
            }
          }
        }
      }
    }
  }

  // Handle duplicates by updating existing leads
  for (const [phone, { index, data: lead, existingId }] of duplicateMap.entries()) {
    try {
      const updated = await updateLead(existingId, {
        ...lead,
        status: lead.status || 'new',
      } as Partial<LeadInsert>)
      results.success.push(updated)
    } catch (error) {
      results.failed.push({
        index,
        data: lead,
        error: error instanceof Error ? error.message : 'Failed to update duplicate lead',
      })
    }
  }

  return results
}

export async function updateLead(id: string, updates: Partial<LeadInsert>) {
  const supabase = createServiceClient()

  // Get current lead to check status change
  const { data: currentLead } = await supabase
    .from('leads')
    .select('status, assigned_to, source, interest_level')
    .eq('id', id)
    .single()

  // Check if source or interest_level changed (affects SLA rule)
  const shouldReapplySLA = 
    (updates.source && updates.source !== currentLead?.source) ||
    (updates.interest_level !== undefined && updates.interest_level !== currentLead?.interest_level)

  const { data, error } = await supabase
    .from('leads')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id)
    .select(`
      *,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name,
        email,
        profile_image_url
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update lead: ${error.message}`)
  }

  // Log status change if status was updated
  if (currentLead && updates.status && currentLead.status !== updates.status) {
    const currentLeadData = currentLead as any
    await supabase.from('lead_status_history').insert({
      lead_id: id,
      old_status: currentLeadData.status,
      new_status: updates.status,
      changed_by: currentLeadData.assigned_to || id,
    } as any)
  }

  // Re-apply SLA rule if source or interest level changed
  if (shouldReapplySLA) {
    try {
      await applySLARuleToLead(id)
    } catch (slaError) {
      // Log but don't fail the update if SLA re-application fails
      console.error('Failed to re-apply SLA rule:', slaError)
    }
  }

  return data
}

export async function deleteLead(id: string) {
  const supabase = createServiceClient()

  const { error } = await supabase.from('leads').delete().eq('id', id)

  if (error) {
    throw new Error(`Failed to delete lead: ${error.message}`)
  }
}
