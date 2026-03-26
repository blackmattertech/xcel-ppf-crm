import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'
import { LEAD_STATUS, LEAD_STATUS_FLOW } from '@/shared/constants/lead-status'

type LeadStatus = typeof LEAD_STATUS[keyof typeof LEAD_STATUS]

export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadStatus,
  changedBy: string,
  notes?: string,
  saveAsLeadNote: boolean = false
) {
  const supabase = createServiceClient()

  // Get current lead
  const { data: currentLead, error: fetchError } = await supabase
    .from('leads')
    .select('status')
    .eq('id', leadId)
    .single()

  if (fetchError || !currentLead) {
    throw new Error('Lead not found')
  }

  const currentLeadData = currentLead as { status: string }
  const oldStatus = currentLeadData.status as LeadStatus

  // Validate status transition
  const allowedStatuses = LEAD_STATUS_FLOW[oldStatus] || []
  if (!allowedStatuses.includes(newStatus) && oldStatus !== newStatus) {
    throw new Error(
      `Invalid status transition from ${oldStatus} to ${newStatus}. Allowed: ${allowedStatuses.join(', ')}`
    )
  }

  // Update lead status
  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }

  // Set converted_at if status is converted
  if (newStatus === LEAD_STATUS.CONVERTED) {
    updateData.converted_at = new Date().toISOString()
  }

  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    // @ts-ignore - Supabase type inference issue with dynamic updates
    .update(updateData)
    .eq('id', leadId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to update lead status: ${updateError.message}`)
  }

  // Log status change
  await supabase.from('lead_status_history').insert({
    lead_id: leadId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: changedBy,
    notes: notes || null,
  } as any)

  if (saveAsLeadNote && notes && notes.trim().length > 0) {
    await supabase.from('lead_notes').insert({
      lead_id: leadId,
      note: notes.trim(),
      created_by: changedBy,
    } as any)
  }

  return updatedLead
}

export async function getLeadStatusHistory(leadId: string) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('lead_status_history')
    .select(`
      *,
      changed_by_user:users!lead_status_history_changed_by_fkey (
        id,
        name,
        email
      )
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch status history: ${error.message}`)
  }

  return data
}
