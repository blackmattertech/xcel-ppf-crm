import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'
import { assignLeadRoundRobin } from './assignment.service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'

type Lead = Database['public']['Tables']['leads']['Row']
type LeadInsert = Database['public']['Tables']['leads']['Insert']

export async function getAllLeads(filters?: {
  status?: string
  source?: string
  assignedTo?: string
  limit?: number
  offset?: number
}) {
  const supabase = createServiceClient()

  let query = supabase
    .from('leads')
    .select(`
      *,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name,
        email
      )
    `)
    .order('created_at', { ascending: false })

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

  return data
}

export async function getLeadById(id: string) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name,
        email
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
    .single()

  if (error) {
    throw new Error(`Failed to fetch lead: ${error.message}`)
  }

  return data
}

export async function createLead(leadData: LeadInsert, autoAssign: boolean = true) {
  const supabase = createServiceClient()

  // Check for duplicate by phone
  if (leadData.phone) {
    interface LeadIdRow {
      id: string
    }
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', leadData.phone)
      .single<LeadIdRow>()

    if (existing) {
      // Update existing lead instead
      return updateLead(existing.id, {
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
        email
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to create lead: ${error.message}`)
  }

  // Create initial status history entry
  const createdLead = data as any
  await supabase.from('lead_status_history').insert({
    lead_id: createdLead.id,
    old_status: null,
    new_status: createdLead.status,
    changed_by: createdLead.assigned_to || createdLead.id, // Use assigned user or lead id as fallback
  } as any)

  return data
}

export async function updateLead(id: string, updates: Partial<LeadInsert>) {
  const supabase = createServiceClient()

  // Get current lead to check status change
  interface LeadStatusAssignedRow {
    status: string
    assigned_to: string | null
  }
  const { data: currentLead } = await supabase
    .from('leads')
    .select('status, assigned_to')
    .eq('id', id)
    .single<LeadStatusAssignedRow>()

  const updateData = {
    ...updates,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('leads')
    .update(updateData as never)
    .eq('id', id)
    .select(`
      *,
      assigned_user:users!leads_assigned_to_fkey (
        id,
        name,
        email
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

  return data
}

export async function deleteLead(id: string) {
  const supabase = createServiceClient()

  const { error } = await supabase.from('leads').delete().eq('id', id)

  if (error) {
    throw new Error(`Failed to delete lead: ${error.message}`)
  }
}
