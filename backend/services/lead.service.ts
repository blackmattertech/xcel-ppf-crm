import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'
import { assignLeadRoundRobin } from './assignment.service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'

type LeadInsert = Database['public']['Tables']['leads']['Insert']

/** List view: explicit columns (avoids surprises if new large columns are added). */
const LEAD_LIST_SELECT = `
  id,
  lead_id,
  name,
  phone,
  email,
  source,
  campaign_id,
  ad_id,
  adset_id,
  form_id,
  form_name,
  ad_name,
  campaign_name,
  meta_data,
  status,
  interest_level,
  budget_range,
  requirement,
  timeline,
  assigned_to,
  branch_id,
  created_at,
  updated_at,
  first_contact_at,
  converted_at,
  payment_status,
  payment_amount,
  advance_amount,
  lost_reason,
  assigned_user:users!leads_assigned_to_fkey (
    id,
    name,
    email,
    profile_image_url
  )
`

const DEFAULT_LEADS_LIMIT = 50
const MAX_LEADS_LIMIT = 200

export type LeadDetailInclude = 'all' | 'minimal'

const LEAD_DETAIL_MINIMAL_SELECT = `
  *,
  assigned_user:users!leads_assigned_to_fkey (
    id,
    name,
    email,
    profile_image_url
  )
`

const LEAD_DETAIL_NESTED_SELECT = `
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
  ),
  lead_notes:lead_notes (
    id,
    note,
    created_at,
    updated_at,
    created_by_user:users!lead_notes_created_by_fkey (
      id,
      name
    )
  )
`

const LEAD_RELATIONS_ONLY_SELECT = `
  id,
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
  ),
  lead_notes:lead_notes (
    id,
    note,
    created_at,
    updated_at,
    created_by_user:users!lead_notes_created_by_fkey (
      id,
      name
    )
  )
`

function assertTeleCallerCanViewLead(
  userRole: string | undefined,
  userId: string | undefined,
  assignedTo: string | null | undefined
) {
  if (userRole === 'tele_caller' && userId && assignedTo !== userId) {
    throw new Error('Forbidden: You can only view leads assigned to you')
  }
}

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
    .select(LEAD_LIST_SELECT)
    .order('created_at', { ascending: false })

  // Pagination: only when limit or offset is requested (default UI fetches full list).
  if (filters?.limit != null || filters?.offset != null) {
    const limit = Math.min(
      filters?.limit ?? DEFAULT_LEADS_LIMIT,
      MAX_LEADS_LIMIT
    )
    const offset = Math.max(0, filters?.offset ?? 0)
    query = query.range(offset, offset + limit - 1)
  }

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

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch leads: ${error.message}`)
  }

  return data || []
}

/** Returns lead counts grouped by status (for pipeline view). Respects role-based filtering. */
export async function getLeadCountsByStatus(filters?: {
  userId?: string
  userRole?: string
}): Promise<Record<string, number>> {
  const supabase = createServiceClient()
  const pAssignedTo =
    filters?.userRole === 'tele_caller' && filters?.userId
      ? filters.userId
      : null

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: 'get_lead_counts_by_status',
        args: { p_assigned_to: string | null }
      ) => Promise<{
        data: { status: string; cnt: number | string }[] | null
        error: { message: string } | null
      }>
    }
  ).rpc('get_lead_counts_by_status', { p_assigned_to: pAssignedTo })

  if (error) {
    throw new Error(`Failed to fetch lead counts: ${error.message}`)
  }

  const counts: Record<string, number> = {}
  const rows = (data || []) as { status: string; cnt: number | string }[]
  for (const row of rows) {
    const s = row.status ?? 'unknown'
    counts[s] = Number(row.cnt)
  }
  return counts
}

export async function getLeadById(
  id: string,
  userId?: string,
  userRole?: string,
  include: LeadDetailInclude = 'all'
) {
  const supabase = createServiceClient()

  const select =
    include === 'minimal'
      ? LEAD_DETAIL_MINIMAL_SELECT
      : `${LEAD_DETAIL_MINIMAL_SELECT},
    ${LEAD_DETAIL_NESTED_SELECT}`

  const query = supabase.from('leads').select(select).eq('id', id)

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Lead not found')
    }
    throw new Error(`Failed to fetch lead: ${error.message}`)
  }

  if (!data) {
    throw new Error('Lead not found')
  }

  assertTeleCallerCanViewLead(userRole, userId, (data as { assigned_to?: string | null }).assigned_to)

  return data
}

/** Status history, calls, and follow-ups only (single round-trip). Same RBAC as getLeadById. */
export async function getLeadRelations(id: string, userId?: string, userRole?: string) {
  const supabase = createServiceClient()

  const { data: stub, error: stubErr } = await supabase
    .from('leads')
    .select('assigned_to')
    .eq('id', id)
    .maybeSingle()

  if (stubErr) {
    throw new Error(`Failed to fetch lead: ${stubErr.message}`)
  }
  if (!stub) {
    throw new Error('Lead not found')
  }

  assertTeleCallerCanViewLead(
    userRole,
    userId,
    (stub as { assigned_to?: string | null }).assigned_to
  )

  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_RELATIONS_ONLY_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Lead not found')
    }
    throw new Error(`Failed to fetch lead relations: ${error.message}`)
  }

  return data
}

export async function createLead(leadData: LeadInsert, autoAssign: boolean = true) {
  const supabase = createServiceClient()

  // Check for duplicate by phone
  if (leadData.phone) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', leadData.phone)
      .single()

    if (existing) {
      // Update existing lead instead
      const existingLead = existing as { id: string }
      return updateLead(existingLead.id, {
        ...leadData,
        status: leadData.status || 'new',
      } as Partial<LeadInsert>)
    }
  }

  // Auto-assign if enabled
  if (autoAssign && leadData.source && !leadData.assigned_to) {
    const assignedUserId = await assignLeadRoundRobin(leadData.source as 'meta' | 'manual' | 'form')
    if (assignedUserId) {
      leadData.assigned_to = assignedUserId
    }
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      ...leadData,
      status: leadData.status || LEAD_STATUS.NEW,
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

  const typedExistingLeads = (existingLeads || []) as { phone: string | null; id: string }[]
  const existingPhones = new Set(typedExistingLeads.map(l => l.phone).filter(Boolean) as string[])

  // Separate new leads from duplicates
  const newLeads: LeadInsert[] = []
  const duplicateMap = new Map<string, { index: number; data: LeadInsert; existingId: string }>()

  leadsData.forEach((lead, index) => {
    if (lead.phone && existingPhones.has(lead.phone)) {
      const existing = typedExistingLeads.find(l => l.phone === lead.phone)
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

  // Handle duplicates by updating existing leads (bounded concurrency)
  const duplicateEntries = Array.from(duplicateMap.entries())
  const CONCURRENCY = 8
  for (let i = 0; i < duplicateEntries.length; i += CONCURRENCY) {
    const chunk = duplicateEntries.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async ([, { index, data: lead, existingId }]) => {
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
            error:
              error instanceof Error ? error.message : 'Failed to update duplicate lead',
          })
        }
      })
    )
  }

  return results
}

export async function updateLead(id: string, updates: Partial<LeadInsert>) {
  const supabase = createServiceClient()

  // Get current lead to check status change
  const { data: currentLead } = await supabase
    .from('leads')
    .select('status, assigned_to')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('leads')
    // @ts-ignore - Supabase type inference issue with dynamic updates
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
  if (currentLead && updates.status) {
    const currentLeadData = currentLead as { status: string; assigned_to: string | null }
    if (currentLeadData.status !== updates.status) {
    await supabase.from('lead_status_history').insert({
      lead_id: id,
      old_status: currentLeadData.status,
      new_status: updates.status,
      changed_by: currentLeadData.assigned_to || id,
    } as any)
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
