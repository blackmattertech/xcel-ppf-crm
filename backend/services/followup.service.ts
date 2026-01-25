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

export async function updateFollowUp(id: string, updates: Partial<FollowUpInsert>) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('follow_ups')
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
  const { data } = await getFollowUps({
    status: 'pending',
    scheduledBefore: now,
    assignedTo,
  })
  return data || []
}
