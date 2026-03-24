import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'

export type CallOutcome = 'connected' | 'not_reachable' | 'wrong_number' | 'call_later'

interface LeadJourneyRow {
  first_contact_at: string | null
  assigned_to: string | null
  status: string
}

/**
 * Applies the same lead status / history rules as manual POST /api/calls after a call is logged.
 * Call insert should already exist (trigger may set first_contact_at).
 */
export async function applyLeadJourneyAfterCall(params: {
  leadId: string
  outcome: CallOutcome
  changedByUserId: string
}): Promise<void> {
  const { leadId, outcome, changedByUserId } = params
  const supabase = createServiceClient()

  const { data: leadData } = await supabase
    .from('leads')
    .select('first_contact_at, assigned_to, status')
    .eq('id', leadId)
    .single()

  const lead = leadData as LeadJourneyRow | null
  if (!lead) {
    throw new Error('Lead not found')
  }

  const isFirstCall = !lead.first_contact_at
  const updates: Record<string, unknown> = {}

  if (isFirstCall) {
    updates.first_contact_at = new Date().toISOString()
  }

  if (outcome === 'wrong_number') {
    updates.status = LEAD_STATUS.LOST
    await supabase.from('lead_status_history').insert({
      lead_id: leadId,
      old_status: lead.status,
      new_status: LEAD_STATUS.LOST,
      changed_by: changedByUserId,
      notes: 'Marked as lost due to wrong number',
    } as never)
  } else if (isFirstCall && lead.status === LEAD_STATUS.NEW) {
    updates.status = LEAD_STATUS.CONTACTED
    await supabase.from('lead_status_history').insert({
      lead_id: leadId,
      old_status: LEAD_STATUS.NEW,
      new_status: LEAD_STATUS.CONTACTED,
      changed_by: changedByUserId,
      notes: 'First call attempt made',
    } as never)
  } else if (
    (outcome === 'not_reachable' || outcome === 'call_later') &&
    lead.status === LEAD_STATUS.NEW
  ) {
    updates.status = LEAD_STATUS.CONTACTED
    await supabase.from('lead_status_history').insert({
      lead_id: leadId,
      old_status: LEAD_STATUS.NEW,
      new_status: LEAD_STATUS.CONTACTED,
      changed_by: changedByUserId,
      notes: `Status updated to contacted: ${outcome === 'not_reachable' ? 'Not Reachable' : 'Call Later'}`,
    } as never)
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('leads').update(updates as never).eq('id', leadId)
  }
}
