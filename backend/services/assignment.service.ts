import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type LeadSource = 'meta' | 'manual' | 'form'

interface UserIdRow {
  id: string
}

interface AssignmentRow {
  id: string
  user_id: string
  lead_source: string
  last_assigned_at: string
  assignment_count: number
}

export async function assignLeadRoundRobin(leadSource: LeadSource): Promise<string | null> {
  const supabase = createServiceClient()

  // Get all users who can be assigned leads (tele_callers, marketing, admin, super_admin)
  // For now, we'll get users with roles that have leads permissions
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .limit(100) // Reasonable limit
    .returns<UserIdRow[]>()

  if (usersError || !users || users.length === 0) {
    return null
  }

  const userIds = users.map((u) => u.id)

  // Get or create assignment records for this source
  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select('*')
    .eq('lead_source', leadSource)
    .in('user_id', userIds)
    .returns<AssignmentRow[]>()

  if (assignmentsError) {
    throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`)
  }

  // Create assignment records for users that don't have one
  const existingUserIds = new Set(assignments?.map((a) => a.user_id) || [])
  const missingUserIds = userIds.filter((id) => !existingUserIds.has(id))

  if (missingUserIds.length > 0) {
    const newAssignments = missingUserIds.map((userId) => ({
      user_id: userId,
      lead_source: leadSource,
      last_assigned_at: new Date(1970, 0, 1).toISOString(), // Very old date
      assignment_count: 0,
    }))

    await supabase.from('assignments').insert(newAssignments as any)
  }

  // Get all assignments for this source (including newly created ones)
  const { data: allAssignments, error: allAssignmentsError } = await supabase
    .from('assignments')
    .select('*')
    .eq('lead_source', leadSource)
    .in('user_id', userIds)
    .order('last_assigned_at', { ascending: true })
    .order('assignment_count', { ascending: true })
    .limit(1)
    .returns<AssignmentRow[]>()

  if (allAssignmentsError || !allAssignments || allAssignments.length === 0) {
    return null
  }

  const selectedAssignment = allAssignments[0]
  const selectedUserId = selectedAssignment.user_id

  // Update assignment record
  const updateData = {
    last_assigned_at: new Date().toISOString(),
    assignment_count: (selectedAssignment.assignment_count || 0) + 1,
  }
  await supabase
    .from('assignments')
    .update(updateData as never)
    .eq('id', selectedAssignment.id)

  return selectedUserId
}
