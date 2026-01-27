import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type LeadSource = 'meta' | 'manual' | 'form'

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

  // Get all users with tele_caller role only
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

  // Get or create assignment records for this source
  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select('*')
    .eq('lead_source', leadSource)
    .in('user_id', userIds)

  if (assignmentsError) {
    throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`)
  }

  // Create assignment records for users that don't have one
  const existingUserIds = new Set((assignments as any[])?.map((a: any) => a.user_id) || [])
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

  if (allAssignmentsError || !allAssignments || allAssignments.length === 0) {
    return null
  }

  const selectedAssignment = (allAssignments as any[])[0]
  const selectedUserId = selectedAssignment.user_id

  // Update assignment record
  await supabase
    .from('assignments')
    // @ts-ignore - Supabase type inference issue with dynamic updates
    .update({
      last_assigned_at: new Date().toISOString(),
      assignment_count: (selectedAssignment.assignment_count || 0) + 1,
    })
    .eq('id', selectedAssignment.id)

  return selectedUserId
}
