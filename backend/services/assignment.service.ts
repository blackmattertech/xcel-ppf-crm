import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'
import { ASSIGNABLE_LEAD_ROLES } from '@/shared/constants/roles'

const LEAD_SOURCES = ['meta', 'manual', 'form'] as const
type LeadSource = (typeof LEAD_SOURCES)[number]

const EPOCH_DATE = new Date(1970, 0, 1).toISOString()

type GetAssignableUserIdsOptions = {
  /** When false, include tele_caller/sales users who opted out of new auto-assignments (for “already owned” checks). Default true. */
  requireReceivesNewLeads?: boolean
}

/**
 * Get user IDs in assignable roles. By default only users with `receives_new_lead_assignments` (round-robin pool).
 */
async function getAssignableUserIds(
  supabase: ReturnType<typeof createServiceClient>,
  excludeUserId?: string,
  options?: GetAssignableUserIdsOptions
): Promise<string[]> {
  const requireReceives = options?.requireReceivesNewLeads !== false

  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id')
    .in('name', [...ASSIGNABLE_LEAD_ROLES])

  if (rolesError || !roles || roles.length === 0) {
    return []
  }

  const roleIds = (roles as { id: string }[]).map((r) => r.id)
  let query = supabase.from('users').select('id').in('role_id', roleIds)

  if (requireReceives) {
    query = query.eq('receives_new_lead_assignments', true)
  }

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

type ReassignUpdate = { id: string; status: string; newAssignee: string }

async function applyRoundRobinReassignments(
  supabase: ReturnType<typeof createServiceClient>,
  updates: ReassignUpdate[],
  triggeredByUserId?: string | null
): Promise<number> {
  if (updates.length === 0) return 0

  const buckets = new Map<string, string[]>()
  for (const u of updates) {
    if (!buckets.has(u.newAssignee)) buckets.set(u.newAssignee, [])
    buckets.get(u.newAssignee)!.push(u.id)
  }

  const succeeded: ReassignUpdate[] = []
  for (const [assigneeId, ids] of buckets) {
    const { error } = await supabase
      .from('leads')
      // @ts-expect-error - Supabase builder infers update payload as 'never'
      .update({ assigned_to: assigneeId })
      .in('id', ids)

    if (error) {
      console.error('[assignment] bulk reassignment failed:', error.message)
      continue
    }
    const idSet = new Set(ids)
    for (const u of updates) {
      if (idSet.has(u.id)) succeeded.push(u)
    }
  }

  if (triggeredByUserId && succeeded.length > 0) {
    const historyRows = succeeded.map((u) => ({
      lead_id: u.id,
      old_status: u.status,
      new_status: u.status,
      changed_by: triggeredByUserId,
    }))
    const { error: hErr } = await supabase.from('lead_status_history').insert(historyRows as any)
    if (hErr) {
      console.error('[assignment] bulk lead_status_history insert failed:', hErr.message)
    }
  }

  return succeeded.length
}

/**
 * Fix-up for NEW leads that are unassigned or assigned to non-assignable users.
 * Does not move leads already assigned to tele_caller/sales (preserves ownership when team changes).
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

  // 1) Assign NEW leads that have no assignee to assignable users (tele_caller/sales) in round-robin
  const { data: unassignedLeads, error: unassignedError } = await supabase
    .from('leads')
    .select('id, status')
    .eq('status', LEAD_STATUS.NEW)
    .is('assigned_to', null)
    .order('created_at', { ascending: true })

  if (!unassignedError && unassignedLeads && unassignedLeads.length > 0) {
    const rows = unassignedLeads as { id: string; status: string }[]
    const n = Math.max(1, assignableUserIds.length)
    const updates: ReassignUpdate[] = rows.map((row, i) => ({
      id: row.id,
      status: row.status,
      newAssignee: assignableUserIds[i % n],
    }))
    reassigned += await applyRoundRobinReassignments(supabase, updates, triggeredByUserId)
  }

  // 2) Reassign NEW leads assigned to a non-assignable role (e.g. admin, marketing) to the receiving pool only.
  // Use all assignable-role user IDs here so leads owned by a paused rep are not stripped.
  const assignableRoleUserIds = await getAssignableUserIds(supabase, undefined, { requireReceivesNewLeads: false })
  const assignableRoleIdSet = new Set(assignableRoleUserIds)
  const { data: newLeadsAssignedToOthers, error: othersError } = await supabase
    .from('leads')
    .select('id, assigned_to, status')
    .eq('status', LEAD_STATUS.NEW)
    .not('assigned_to', 'is', null)

  if (!othersError && newLeadsAssignedToOthers && newLeadsAssignedToOthers.length > 0 && assignableUserIds.length >= 1) {
    const toReassign = (newLeadsAssignedToOthers as { id: string; assigned_to: string; status: string }[]).filter(
      (row) => !assignableRoleIdSet.has(row.assigned_to)
    )
    const n = Math.max(1, assignableUserIds.length)
    const updates: ReassignUpdate[] = toReassign.map((lead, i) => ({
      id: lead.id,
      status: lead.status,
      newAssignee: assignableUserIds[i % n],
    }))
    reassigned += await applyRoundRobinReassignments(supabase, updates, triggeredByUserId)
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
    const { error } = await supabase
      .from('leads')
      // @ts-expect-error - Supabase builder infers update payload as 'never'
      .update({ assigned_to: null })
      .in('id', leadIds)
    if (error) {
      console.error('[reassignLeadsFromDeletedUser] bulk unassign failed:', error.message)
      return 0
    }
    return leadIds.length
  }

  const n = assigneeIds.length
  const buckets = new Map<string, string[]>()
  for (let i = 0; i < leadIds.length; i++) {
    const newAssigneeId = assigneeIds[i % n]
    if (!buckets.has(newAssigneeId)) buckets.set(newAssigneeId, [])
    buckets.get(newAssigneeId)!.push(leadIds[i])
  }

  let reassigned = 0
  for (const [assigneeId, ids] of buckets) {
    const { error: updateError } = await supabase
      .from('leads')
      // @ts-expect-error - Supabase builder infers update payload as 'never'
      .update({ assigned_to: assigneeId })
      .in('id', ids)
    if (!updateError) reassigned += ids.length
    else console.error('[reassignLeadsFromDeletedUser] bulk update failed:', updateError.message)
  }

  return reassigned
}
