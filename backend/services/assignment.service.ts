import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'

const LEAD_SOURCES = ['meta', 'manual', 'form'] as const
type LeadSource = (typeof LEAD_SOURCES)[number]

const EPOCH_DATE = new Date(1970, 0, 1).toISOString()

export async function assignLeadRoundRobin(leadSource: LeadSource): Promise<string | null> {
  const supabase = createServiceClient()

  // Get only users with tele_caller role
  const { data: teleCallerRole, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'tele_caller')
    .single()

  if (roleError || !teleCallerRole) {
    console.error('Tele caller role not found:', roleError)
    return null
  }

  // Get all users with tele_caller role
  const roleData = teleCallerRole as { id: string }
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('role_id', roleData.id)

  if (usersError || !users || users.length === 0) {
    console.error('No tele_caller users found:', usersError)
    return null
  }

  const userIds = (users as { id: string }[]).map((u) => u.id)

  // Get ALL assignment rows for all tele_callers (any source) to see who is missing for THIS source
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

  // Create assignment rows for this source for any new tele_callers (so they get into the round-robin)
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
        `[assignLeadRoundRobin] Failed to create assignment rows for new tele_callers (source=${leadSource}):`,
        insertError.message
      )
      // Continue: we may still have at least one assignable user from existing rows
    }
  }

  // Ensure every tele_caller has rows for ALL sources (so future leads for other sources also round-robin)
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
      console.error('[assignLeadRoundRobin] Failed to backfill assignment rows for all sources:', bulkInsertError.message)
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
 * Redistribute existing leads with status "new" among all tele_callers in round-robin
 * when a new tele_caller is added. Call this after creating or updating a user to tele_caller role.
 * - Leads already assigned to a tele_caller: redistributed when there are >= 2 tele_callers.
 * - Leads with assigned_to = NULL (e.g. after the previous assignee was deleted): assigned to
 *   tele_callers in round-robin even when there is only one tele_caller.
 * @param triggeredByUserId - Optional; if provided, used as changed_by for lead_status_history entries
 * @returns Number of leads reassigned
 */
export async function redistributeNewLeadsAmongTeleCallers(
  triggeredByUserId?: string | null
): Promise<number> {
  const supabase = createServiceClient()

  const { data: teleCallerRole, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'tele_caller')
    .single()

  if (roleError || !teleCallerRole) {
    console.error('[redistributeNewLeads] Tele caller role not found:', roleError)
    return 0
  }

  const roleId = (teleCallerRole as { id: string }).id
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('role_id', roleId)

  if (usersError || !users || users.length === 0) {
    return 0
  }

  const teleCallerIds = (users as { id: string }[]).map((u) => u.id)
  let reassigned = 0

  // 1) Redistribute NEW leads that are already assigned to a tele_caller (only when >= 2 tele_callers)
  if (teleCallerIds.length >= 2) {
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, assigned_to, status')
      .eq('status', LEAD_STATUS.NEW)
      .not('assigned_to', 'is', null)
      .in('assigned_to', teleCallerIds)
      .order('created_at', { ascending: true })

    if (!leadsError && leads && leads.length > 0) {
      const leadRows = leads as { id: string; assigned_to: string; status: string }[]
      const n = teleCallerIds.length
      for (let i = 0; i < leadRows.length; i++) {
        const lead = leadRows[i]
        const newAssigneeId = teleCallerIds[i % n]
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

  // 2) Assign NEW leads that have no assignee (e.g. DB SET NULL after previous tele_caller was deleted) to tele_callers in round-robin
  const { data: unassignedLeads, error: unassignedError } = await supabase
    .from('leads')
    .select('id, status')
    .eq('status', LEAD_STATUS.NEW)
    .is('assigned_to', null)
    .order('created_at', { ascending: true })

  if (!unassignedError && unassignedLeads && unassignedLeads.length > 0) {
    const rows = unassignedLeads as { id: string; status: string }[]
    const n = Math.max(1, teleCallerIds.length)
    for (let i = 0; i < rows.length; i++) {
      const newAssigneeId = teleCallerIds[i % n]
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

  // 3) Reassign NEW leads that are assigned to a non-tele_caller (e.g. admin after deleting the only tele_caller) to tele_callers in round-robin
  const teleCallerIdSet = new Set(teleCallerIds)
  const { data: newLeadsAssignedToOthers, error: othersError } = await supabase
    .from('leads')
    .select('id, assigned_to, status')
    .eq('status', LEAD_STATUS.NEW)
    .not('assigned_to', 'is', null)

  if (!othersError && newLeadsAssignedToOthers && newLeadsAssignedToOthers.length > 0 && teleCallerIds.length >= 1) {
    const toReassign = (newLeadsAssignedToOthers as { id: string; assigned_to: string; status: string }[]).filter(
      (row) => !teleCallerIdSet.has(row.assigned_to)
    )
    const n = Math.max(1, teleCallerIds.length)
    for (let i = 0; i < toReassign.length; i++) {
      const lead = toReassign[i]
      const newAssigneeId = teleCallerIds[i % n]
      const { error: updateError } = await supabase
        .from('leads')
        // @ts-expect-error - Supabase builder infers update payload as 'never'; leads.Update is defined in database.ts
        .update({ assigned_to: newAssigneeId })
        .eq('id', lead.id)

      if (updateError) {
        console.error(`[redistributeNewLeads] Failed to reassign lead ${lead.id} from non-tele_caller:`, updateError.message)
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
 * Prefers round-robin among tele_callers; falls back to reassignToUserId or any other user.
 * @param deletedUserId - The user being deleted
 * @param reassignToUserId - Optional admin performing the delete; used as fallback assignee
 * @returns Number of leads reassigned
 */
export async function reassignLeadsFromDeletedUser(
  deletedUserId: string,
  reassignToUserId: string | null
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

  // Prefer tele_callers for round-robin; exclude the deleted user
  const { data: teleCallerRole } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'tele_caller')
    .single()

  let assigneeIds: string[] = []
  if (teleCallerRole) {
    const { data: teleCallers } = await supabase
      .from('users')
      .select('id')
      .eq('role_id', (teleCallerRole as { id: string }).id)
      .neq('id', deletedUserId)
    assigneeIds = (teleCallers as { id: string }[] || []).map((u) => u.id)
  }

  if (assigneeIds.length === 0 && reassignToUserId && reassignToUserId !== deletedUserId) {
    assigneeIds = [reassignToUserId]
  }

  if (assigneeIds.length === 0) {
    const { data: anyUser } = await supabase
      .from('users')
      .select('id')
      .neq('id', deletedUserId)
      .limit(1)
      .maybeSingle()
    if (anyUser) {
      assigneeIds = [(anyUser as { id: string }).id]
    }
  }

  if (assigneeIds.length === 0) {
    return 0
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
