import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type FollowUp = Database['public']['Tables']['follow_ups']['Row']
type FollowUpInsert = Database['public']['Tables']['follow_ups']['Insert']

export async function createFollowUp(followUpData: FollowUpInsert) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('follow_ups')
    .insert({
      ...followUpData,
      status: followUpData.status || 'pending',
    } as any)
    .select(`
      *,
      assigned_user:users!follow_ups_assigned_to_fkey (
        id,
        name,
        email
      ),
      lead:leads (
        id,
        name,
        phone,
        status
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to create follow-up: ${error.message}`)
  }

  return data
}

export async function getFollowUps(filters?: {
  assignedTo?: string
  leadId?: string
  status?: string
  scheduledBefore?: string
  scheduledAfter?: string
}) {
  const supabase = createServiceClient()

  let query = supabase
    .from('follow_ups')
    .select(`
      *,
      assigned_user:users!follow_ups_assigned_to_fkey (
        id,
        name,
        email
      ),
      lead:leads (
        id,
        name,
        phone,
        status
      )
    `)
    .order('scheduled_at', { ascending: true })

  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo)
  }

  if (filters?.leadId) {
    query = query.eq('lead_id', filters.leadId)
  }

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.scheduledBefore) {
    query = query.lte('scheduled_at', filters.scheduledBefore)
  }

  if (filters?.scheduledAfter) {
    query = query.gte('scheduled_at', filters.scheduledAfter)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch follow-ups: ${error.message}`)
  }

  return data
}

/** Get follow-up counts per lead (single query). Returns Record<leadId, count>. */
export async function getFollowUpCountsByLeadIds(leadIds: string[]): Promise<Record<string, number>> {
  if (leadIds.length === 0) return {}
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('follow_ups')
    .select('lead_id')
    .in('lead_id', leadIds)
  if (error) {
    throw new Error(`Failed to fetch follow-up counts: ${error.message}`)
  }
  const counts: Record<string, number> = {}
  for (const id of leadIds) counts[id] = 0
  for (const row of Array.isArray(data) ? data : []) {
    const lid = (row as { lead_id?: string }).lead_id
    if (lid) counts[lid] = (counts[lid] ?? 0) + 1
  }
  return counts
}

export async function updateFollowUp(id: string, updates: Partial<FollowUpInsert>) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('follow_ups')
    // @ts-ignore - Supabase type inference issue with dynamic updates
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id)
    .select(`
      *,
      assigned_user:users!follow_ups_assigned_to_fkey (
        id,
        name,
        email
      ),
      lead:leads (
        id,
        name,
        phone,
        status
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update follow-up: ${error.message}`)
  }

  return data
}

export async function completeFollowUp(id: string, notes?: string) {
  return updateFollowUp(id, {
    status: 'done',
    completed_at: new Date().toISOString(),
    notes: notes || undefined,
  })
}

export async function deleteFollowUp(id: string) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('follow_ups').delete().eq('id', id)
  if (error) {
    throw new Error(`Failed to delete follow-up: ${error.message}`)
  }
  return { deleted: true }
}

export async function deleteAllFollowUps(filters?: { assignedTo?: string }): Promise<{ deletedCount: number }> {
  const supabase = createServiceClient()
  // Supabase requires a WHERE clause on DELETE; fetch ids first then delete by id.in()
  let selectQuery = supabase.from('follow_ups').select('id')
  if (filters?.assignedTo) {
    selectQuery = selectQuery.eq('assigned_to', filters.assignedTo)
  }
  const { data: rows, error: selectError } = await selectQuery
  if (selectError) {
    throw new Error(`Failed to fetch follow-ups for delete: ${selectError.message}`)
  }
  const rowList: { id: string }[] = Array.isArray(rows) ? rows : []
  const ids = rowList.map((r) => r.id).filter(Boolean)
  if (ids.length === 0) {
    return { deletedCount: 0 }
  }
  const { data, error } = await supabase.from('follow_ups').delete().select('id').in('id', ids)
  if (error) {
    throw new Error(`Failed to delete follow-ups: ${error.message}`)
  }
  const deletedCount = Array.isArray(data) ? data.length : 0
  return { deletedCount }
}

/**
 * Delete follow-ups by IDs. When allowedAssignedTo is set, only deletes rows where assigned_to matches (for permission check).
 */
export async function deleteFollowUpsByIds(
  ids: string[],
  allowedAssignedTo?: string | null
): Promise<{ deletedCount: number }> {
  if (ids.length === 0) return { deletedCount: 0 }
  const supabase = createServiceClient()
  let selectQuery = supabase.from('follow_ups').select('id').in('id', ids)
  if (allowedAssignedTo != null) {
    selectQuery = selectQuery.eq('assigned_to', allowedAssignedTo)
  }
  const { data: rows, error: selectError } = await selectQuery
  if (selectError) {
    throw new Error(`Failed to fetch follow-ups: ${selectError.message}`)
  }
  const rowList: { id: string }[] = Array.isArray(rows) ? rows : []
  const allowedIds = rowList.map((r) => r.id).filter(Boolean)
  if (allowedIds.length === 0) return { deletedCount: 0 }
  const { data, error } = await supabase.from('follow_ups').delete().select('id').in('id', allowedIds)
  if (error) {
    throw new Error(`Failed to delete follow-ups: ${error.message}`)
  }
  return { deletedCount: Array.isArray(data) ? data.length : 0 }
}

export async function getPendingFollowUps(assignedTo?: string) {
  const now = new Date().toISOString()
  return getFollowUps({
    status: 'pending',
    scheduledBefore: now,
    assignedTo,
  })
}

export async function getOverdueFollowUps(assignedTo?: string) {
  const now = new Date().toISOString()
  const result = await getFollowUps({
    status: 'pending',
    scheduledBefore: now,
    assignedTo,
  })
  return ((result as any).data) || []
}
