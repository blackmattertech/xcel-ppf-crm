import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'
import { ASSIGNABLE_LEAD_ROLES } from '@/shared/constants/roles'

const LEAD_SOURCES = ['meta', 'manual', 'form'] as const
type LeadSource = (typeof LEAD_SOURCES)[number]

const EPOCH_DATE = new Date(1970, 0, 1).toISOString()

/**
 * Get user IDs that are eligible for lead assignment (tele_caller and sales-type roles only).
 * Excludes admin, marketing, etc.
 */
async function getAssignableUserIds(supabase: ReturnType<typeof createServiceClient>, excludeUserId?: string): Promise<string[]> {
  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id')
    .in('name', [...ASSIGNABLE_LEAD_ROLES])

  if (rolesError || !roles || roles.length === 0) {
    return []
  }

  const roleIds = (roles as { id: string }[]).map((r) => r.id)
  let query = supabase
    .from('users')
    .select('id')
    .in('role_id', roleIds)

  if (excludeUserId) {
    query = query.neq('id', excludeUserId)
  }

  const { data: users, error: usersError } = await query

  if (usersError || !users || users.length === 0) {
    return []
  }

  return (users as { id: string }[]).map((u) => u.id)
}

export async function assignLeadRoundRobin(leadSource: LeadSource): Promise<string | null> {
  const supabase = createServiceClient()

  const userIds = await getAssignableUserIds(supabase)

  if (userIds.length === 0) {
    console.error('No assignable users (tele_caller or sales) found for lead assignment')
    return null
  }

  // Get ALL assignment rows for assignable users (any source) to see who is missing for THIS source
  const { data: assignmentsForSource, error: assignmentsError } = await supabase
    .from('assignments')
    .select('user_id')
    .eq('lead_source', leadSource)
    .in('user_id', userIds)

  if (assignmentsError) {
    throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`)
  }

  const existingUserIds = new Set((assignmentsForSource as { user_id: string }[])?.map((a) => a.user_id) || [])
  const missingUserIds = userIds.filter((id) => !existingUserIds.has(id))

  // Create assignment rows for this source for any new assignable users (so they get into the round-robin)
  if (missingUserIds.length > 0) {
    const newRows = missingUserIds.map((userId) => ({
      user_id: userId,
      lead_source: leadSource,
      last_assigned_at: EPOCH_DATE,
      assignment_count: 0,
    }))

    const { error: insertError } = await supabase.from('assignments').insert(newRows as any)

    if (insertError) {
      console.error(
        `[assignLeadRoundRobin] Failed to create assignment rows for new assignable users (source=${leadSource}):`,
        insertError.message
      )
      // Continue: we may still have at least one assignable user from existing rows
    }
  }

  // Ensure every assignable user has rows for ALL sources (so future leads for other sources also round-robin)
  const { data: allAssignments } = await supabase
    .from('assignments')
    .select('user_id, lead_source')
    .in('user_id', userIds)
    .in('lead_source', [...LEAD_SOURCES])

  const existingByUserAndSource = new Set(
    (allAssignments as { user_id: string; lead_source: string }[]).map((a) => `${a.user_id}:${a.lead_source}`)
  )
  const toInsert: { user_id: string; lead_source: string; last_assigned_at: string; assignment_count: number }[] = []
  for (const userId of userIds) {
    for (const source of LEAD_SOURCES) {
      if (!existingByUserAndSource.has(`${userId}:${source}`)) {
        toInsert.push({
          user_id: userId,
          lead_source: source,
          last_assigned_at: EPOCH_DATE,
          assignment_count: 0,
        })
      }
    }
  }
  if (toInsert.length > 0) {
    const { error: bulkInsertError } = await supabase.from('assignments').insert(toInsert as any)
    if (bulkInsertError) {
      console.error('[assignLeadRoundRobin] Failed to backfill assignment rows for assignable users:', bulkInsertError.message)
    }
  }

  // Get assignments for THIS source only, ordered by least recently assigned then by count
  const { data: allAssignmentsForSource, error: allAssignmentsError } = await supabase
    .from('assignments')
    .select('id, user_id, assignment_count, last_assigned_at')
    .eq('lead_source', leadSource)
    .in('user_id', userIds)
    .order('last_assigned_at', { ascending: true })
    .order('assignment_count', { ascending: true })
    .limit(1)

  if (allAssignmentsError || !allAssignmentsForSource || allAssignmentsForSource.length === 0) {
    return null
  }

  const selected = allAssignmentsForSource[0] as {
    id: string
    user_id: string
    assignment_count: number
    last_assigned_at: string
  }

  await supabase
    .from('assignments')
    // @ts-expect-error - Supabase builder infers update payload as 'never'; assignments.Update is defined in database.ts
    .update({
      last_assigned_at: new Date().toISOString(),
      assignment_count: (selected.assignment_count || 0) + 1,
    })
    .eq('id', selected.id)

  return selected.user_id
}

/**
 * Redistribute existing leads with status "new" among assignable users (tele_caller + sales) in round-robin.
 * Call this when a new assignable user is added, or to fix leads assigned to non-assignable roles.
 * - Leads already assigned to an assignable user: redistributed when there are >= 2 assignable users.
 * - Leads with assigned_to = NULL: assigned to assignable users in round-robin.
 * - Leads assigned to a different role (e.g. admin, marketing): reassigned to assignable users in round-robin.
 * @param triggeredByUserId - Optional; if provided, used as changed_by for lead_status_history entries
 * @returns Number of leads reassigned
 */
export async function redistributeNewLeadsAmongTeleCallers(
  triggeredByUserId?: string | null
): Promise<number> {
  const supabase = createServiceClient()

  const assignableUserIds = await getAssignableUserIds(supabase)

  if (assignableUserIds.length === 0) {
    return 0
  }

  let reassigned = 0

  // 1) Redistribute NEW leads already assigned to an assignable user (only when >= 2 assignable users)
  if (assignableUserIds.length >= 2) {
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, assigned_to, status')
      .eq('status', LEAD_STATUS.NEW)
      .not('assigned_to', 'is', null)
      .in('assigned_to', assignableUserIds)
      .order('created_at', { ascending: true })

    if (!leadsError && leads && leads.length > 0) {
      const leadRows = leads as { id: string; assigned_to: string; status: string }[]
      const n = assignableUserIds.length
      for (let i = 0; i < leadRows.length; i++) {
        const lead = leadRows[i]
        const newAssigneeId = assignableUserIds[i % n]
        if (lead.assigned_to === newAssigneeId) continue

        const { error: updateError } = await supabase
          .from('leads')
          // @ts-expect-error - Supabase builder infers update payload as 'never'; leads.Update is defined in database.ts
          .update({ assigned_to: newAssigneeId })
          .eq('id', lead.id)

        if (updateError) {
          console.error(`[redistributeNewLeads] Failed to reassign lead ${lead.id}:`, updateError.message)
          continue
        }
        reassigned++
        if (triggeredByUserId) {
          try {
            await supabase.from('lead_status_history').insert({
              lead_id: lead.id,
              old_status: lead.status,
              new_status: lead.status,
              changed_by: triggeredByUserId,
            } as any)
          } catch {
            // Non-fatal
          }
        }
      }
    }
  }

  // 2) Assign NEW leads that have no assignee to assignable users (tele_caller/sales) in round-robin
  const { data: unassignedLeads, error: unassignedError } = await supabase
    .from('leads')
    .select('id, status')
    .eq('status', LEAD_STATUS.NEW)
    .is('assigned_to', null)
    .order('created_at', { ascending: true })

  if (!unassignedError && unassignedLeads && unassignedLeads.length > 0) {
    const rows = unassignedLeads as { id: string; status: string }[]
    const n = Math.max(1, assignableUserIds.length)
    for (let i = 0; i < rows.length; i++) {
      const newAssigneeId = assignableUserIds[i % n]
      const { error: updateError } = await supabase
        .from('leads')
        // @ts-expect-error - Supabase builder infers update payload as 'never'; leads.Update is defined in database.ts
        .update({ assigned_to: newAssigneeId })
        .eq('id', rows[i].id)

      if (updateError) {
        console.error(`[redistributeNewLeads] Failed to assign unassigned lead ${rows[i].id}:`, updateError.message)
        continue
      }
      reassigned++
      if (triggeredByUserId) {
        try {
          await supabase.from('lead_status_history').insert({
            lead_id: rows[i].id,
            old_status: rows[i].status,
            new_status: rows[i].status,
            changed_by: triggeredByUserId,
          } as any)
        } catch {
          // Non-fatal
        }
      }
    }
  }

  // 3) Reassign NEW leads assigned to a non-assignable role (e.g. admin, marketing) to assignable users (tele_caller/sales) in round-robin
  const assignableIdSet = new Set(assignableUserIds)
  const { data: newLeadsAssignedToOthers, error: othersError } = await supabase
    .from('leads')
    .select('id, assigned_to, status')
    .eq('status', LEAD_STATUS.NEW)
    .not('assigned_to', 'is', null)

  if (!othersError && newLeadsAssignedToOthers && newLeadsAssignedToOthers.length > 0 && assignableUserIds.length >= 1) {
    const toReassign = (newLeadsAssignedToOthers as { id: string; assigned_to: string; status: string }[]).filter(
      (row) => !assignableIdSet.has(row.assigned_to)
    )
    const n = Math.max(1, assignableUserIds.length)
    for (let i = 0; i < toReassign.length; i++) {
      const lead = toReassign[i]
      const newAssigneeId = assignableUserIds[i % n]
      const { error: updateError } = await supabase
        .from('leads')
        // @ts-expect-error - Supabase builder infers update payload as 'never'; leads.Update is defined in database.ts
        .update({ assigned_to: newAssigneeId })
        .eq('id', lead.id)

      if (updateError) {
        console.error(`[redistributeNewLeads] Failed to reassign lead ${lead.id} from non-assignable user:`, updateError.message)
        continue
      }
      reassigned++
      if (triggeredByUserId) {
        try {
          await supabase.from('lead_status_history').insert({
            lead_id: lead.id,
            old_status: lead.status,
            new_status: lead.status,
            changed_by: triggeredByUserId,
          } as any)
        } catch {
          // Non-fatal
        }
      }
    }
  }

  return reassigned
}

/**
 * Reassign all leads from a deleted user to other users.
 * Only assigns to tele_caller or sales roles (round-robin). Does not assign to admin/marketing.
 * If no assignable user exists, leads are left unassigned (assigned_to = null).
 * @param deletedUserId - The user being deleted
 * @param _reassignToUserId - Unused; we only assign to tele_caller/sales pool
 * @returns Number of leads reassigned
 */
export async function reassignLeadsFromDeletedUser(
  deletedUserId: string,
  _reassignToUserId: string | null
): Promise<number> {
  const supabase = createServiceClient()

  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id')
    .eq('assigned_to', deletedUserId)

  if (leadsError || !leads || leads.length === 0) {
    return 0
  }

  const leadIds = (leads as { id: string }[]).map((l) => l.id)

  // Only assign to tele_caller or sales roles (round-robin); exclude the deleted user
  const assigneeIds = await getAssignableUserIds(supabase, deletedUserId)

  if (assigneeIds.length === 0) {
    // No assignable users: leave leads unassigned so they can be picked up by redistribution later
    for (const leadId of leadIds) {
      await supabase
        .from('leads')
        // @ts-expect-error - Supabase builder infers update payload as 'never'
        .update({ assigned_to: null })
        .eq('id', leadId)
    }
    return leadIds.length
  }

  const n = assigneeIds.length
  let reassigned = 0
  for (let i = 0; i < leadIds.length; i++) {
    const newAssigneeId = assigneeIds[i % n]
    const { error: updateError } = await supabase
      .from('leads')
      // @ts-expect-error - Supabase builder infers update payload as 'never'
      .update({ assigned_to: newAssigneeId })
      .eq('id', leadIds[i])

    if (!updateError) {
      reassigned++
    }
  }

  return reassigned
}
