import { createServiceClient } from '@/lib/supabase/service'
import { computeEnrollmentDay, todayIstDateString } from '@/shared/whatsapp-automation-ist'
import { getTemplateById } from '@/backend/services/whatsapp-template.service'
import type {
  AutomationBucketLink,
  AutomationEnrollment,
  AutomationFlow,
  AutomationFlowWithTriggers,
  AutomationTrigger,
  CreateAutomationFlowInput,
  UpdateAutomationFlowInput,
  UpsertAutomationTriggerInput,
} from '@/shared/whatsapp-automation-types'

const MAX_ACTIVE_FLOWS = 2

const FLOW_SELECT = `
  id,
  name,
  cycle_days,
  restart_on_complete,
  is_active,
  created_by,
  created_at,
  updated_at
`

const TRIGGER_SELECT = `
  id,
  flow_id,
  day_offset,
  message_type,
  template_id,
  body_parameters,
  header_parameters,
  message_body,
  media_url,
  media_mime_type,
  media_file_name,
  media_meta_id,
  created_at,
  updated_at
`

function assertTeleCallerCanAccessLead(
  userRole: string | undefined,
  userId: string | undefined,
  assignedTo: string | null | undefined
) {
  if (userRole === 'tele_caller' && userId && assignedTo !== userId) {
    throw new Error('Forbidden: You can only manage leads assigned to you')
  }
}

export async function countActiveFlows(): Promise<number> {
  const supabase = createServiceClient()
  const { count, error } = await supabase
    .from('whatsapp_automation_flows')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
  if (error) throw new Error(`Failed to count flows: ${error.message}`)
  return count ?? 0
}

export async function listFlows(opts?: { activeOnly?: boolean }): Promise<AutomationFlow[]> {
  const supabase = createServiceClient()
  let query = supabase.from('whatsapp_automation_flows').select(FLOW_SELECT).order('created_at', { ascending: true })
  if (opts?.activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(`Failed to list flows: ${error.message}`)
  return (data || []) as AutomationFlow[]
}

export async function getFlowById(id: string): Promise<AutomationFlowWithTriggers | null> {
  const supabase = createServiceClient()
  const { data: flow, error: flowError } = await supabase
    .from('whatsapp_automation_flows')
    .select(FLOW_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (flowError) throw new Error(`Failed to fetch flow: ${flowError.message}`)
  if (!flow) return null

  const { data: triggers, error: trigError } = await supabase
    .from('whatsapp_automation_triggers')
    .select(TRIGGER_SELECT)
    .eq('flow_id', id)
    .order('day_offset', { ascending: true })
  if (trigError) throw new Error(`Failed to fetch triggers: ${trigError.message}`)

  return {
    ...(flow as AutomationFlow),
    triggers: (triggers || []) as AutomationTrigger[],
  }
}

export async function createFlow(input: CreateAutomationFlowInput): Promise<AutomationFlow> {
  if (input.cycle_days < 1 || input.cycle_days > 30) {
    throw new Error('cycle_days must be between 1 and 30')
  }
  if (input.is_active !== false) {
    const active = await countActiveFlows()
    if (active >= MAX_ACTIVE_FLOWS) {
      throw new Error(`Maximum ${MAX_ACTIVE_FLOWS} active automation flows allowed`)
    }
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_automation_flows')
    // @ts-ignore
    .insert({
      name: input.name.trim(),
      cycle_days: input.cycle_days,
      restart_on_complete: input.restart_on_complete ?? false,
      is_active: input.is_active !== false,
      created_by: input.created_by,
    })
    .select(FLOW_SELECT)
    .single()

  if (error) {
    if (error.message.includes('Maximum 2 active')) throw new Error(error.message)
    throw new Error(`Failed to create flow: ${error.message}`)
  }
  return data as AutomationFlow
}

export async function updateFlow(id: string, input: UpdateAutomationFlowInput): Promise<AutomationFlow> {
  if (input.cycle_days !== undefined && (input.cycle_days < 1 || input.cycle_days > 30)) {
    throw new Error('cycle_days must be between 1 and 30')
  }

  const existing = await getFlowById(id)
  if (!existing) throw new Error('Flow not found')

  if (input.cycle_days !== undefined && input.cycle_days < existing.cycle_days) {
    const invalid = existing.triggers.filter((t) => t.day_offset >= input.cycle_days!)
    if (invalid.length > 0) {
      throw new Error(
        `Cannot shorten cycle: remove triggers on days ${invalid.map((t) => t.day_offset).join(', ')} first`
      )
    }
  }

  if (input.is_active === true && !existing.is_active) {
    const active = await countActiveFlows()
    if (active >= MAX_ACTIVE_FLOWS) {
      throw new Error(`Maximum ${MAX_ACTIVE_FLOWS} active automation flows allowed`)
    }
  }

  const updateData: Record<string, unknown> = {}
  if (input.name !== undefined) updateData.name = input.name.trim()
  if (input.cycle_days !== undefined) updateData.cycle_days = input.cycle_days
  if (input.restart_on_complete !== undefined) updateData.restart_on_complete = input.restart_on_complete
  if (input.is_active !== undefined) updateData.is_active = input.is_active

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_automation_flows')
    // @ts-ignore
    .update(updateData)
    .eq('id', id)
    .select(FLOW_SELECT)
    .single()

  if (error) {
    if (error.message.includes('Maximum 2 active')) throw new Error(error.message)
    throw new Error(`Failed to update flow: ${error.message}`)
  }
  return data as AutomationFlow
}

export async function deleteFlow(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('whatsapp_automation_flows').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete flow: ${error.message}`)
}

async function validateTriggerInput(
  flow: AutomationFlow,
  input: UpsertAutomationTriggerInput
): Promise<void> {
  if (input.day_offset < 0 || input.day_offset >= flow.cycle_days) {
    throw new Error(`day_offset must be between 0 and ${flow.cycle_days - 1}`)
  }

  switch (input.message_type) {
    case 'template': {
      if (!input.template_id) throw new Error('template_id is required for template triggers')
      const tpl = await getTemplateById(input.template_id)
      if (!tpl) throw new Error('Template not found')
      if (tpl.status !== 'approved') throw new Error('Template must be APPROVED')
      break
    }
    case 'text': {
      if (!input.message_body?.trim()) throw new Error('message_body is required for text triggers')
      break
    }
    case 'image':
    case 'video': {
      if (!input.media_url?.trim()) {
        throw new Error(
          `Upload a ${input.message_type} file for day ${input.day_offset} before saving (public media URL required for sending)`
        )
      }
      break
    }
    default:
      throw new Error('Invalid message_type')
  }
}

export async function replaceFlowTriggers(
  flowId: string,
  triggers: UpsertAutomationTriggerInput[]
): Promise<AutomationTrigger[]> {
  const flow = await getFlowById(flowId)
  if (!flow) throw new Error('Flow not found')

  const daySet = new Set<number>()
  for (const t of triggers) {
    if (daySet.has(t.day_offset)) throw new Error(`Duplicate day_offset: ${t.day_offset}`)
    daySet.add(t.day_offset)
    await validateTriggerInput(flow, t)
  }

  const supabase = createServiceClient()
  const { error: delError } = await supabase.from('whatsapp_automation_triggers').delete().eq('flow_id', flowId)
  if (delError) throw new Error(`Failed to clear triggers: ${delError.message}`)

  if (triggers.length === 0) return []

  const rows = triggers.map((t) => ({
    flow_id: flowId,
    day_offset: t.day_offset,
    message_type: t.message_type,
    template_id: t.message_type === 'template' ? t.template_id : null,
    body_parameters: t.body_parameters ?? null,
    header_parameters: t.header_parameters ?? null,
    message_body: t.message_body?.trim() || null,
    media_url: t.media_url?.trim() || null,
    media_mime_type: t.media_mime_type?.trim() || null,
    media_file_name: t.media_file_name?.trim() || null,
    media_meta_id: t.media_meta_id?.trim() || null,
  }))

  const { data, error } = await supabase
    .from('whatsapp_automation_triggers')
    // @ts-ignore
    .insert(rows)
    .select(TRIGGER_SELECT)

  if (error) throw new Error(`Failed to save triggers: ${error.message}`)
  return (data || []) as AutomationTrigger[]
}

export async function getEnrollmentsForLead(leadId: string): Promise<AutomationEnrollment[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_automation_lead_enrollments')
    .select(
      `
      id, flow_id, lead_id, started_at, cycle_number, status, source, bucket_link_id, enrolled_by, created_at, updated_at,
      flow:whatsapp_automation_flows ( id, name, cycle_days )
    `
    )
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch enrollments: ${error.message}`)
  return (data || []) as AutomationEnrollment[]
}

async function insertEnrollment(params: {
  flowId: string
  leadId: string
  enrolledBy: string
  source: 'direct' | 'bucket'
  bucketLinkId?: string | null
}): Promise<AutomationEnrollment> {
  const flow = await getFlowById(params.flowId)
  if (!flow || !flow.is_active) throw new Error('Flow not found or inactive')

  const supabase = createServiceClient()
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, assigned_to')
    .eq('id', params.leadId)
    .maybeSingle()
  if (leadErr) throw new Error(`Failed to fetch lead: ${leadErr.message}`)
  if (!lead) throw new Error('Lead not found')

  const { data: existing } = await supabase
    .from('whatsapp_automation_lead_enrollments')
    .select('id')
    .eq('flow_id', params.flowId)
    .eq('lead_id', params.leadId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    const err = new Error('Lead is already enrolled in this flow')
    ;(err as Error & { statusCode: number }).statusCode = 409
    throw err
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('whatsapp_automation_lead_enrollments')
    // @ts-ignore
    .insert({
      flow_id: params.flowId,
      lead_id: params.leadId,
      started_at: now,
      cycle_number: 1,
      status: 'active',
      source: params.source,
      bucket_link_id: params.bucketLinkId ?? null,
      enrolled_by: params.enrolledBy,
    })
    .select('id, flow_id, lead_id, started_at, cycle_number, status, source, bucket_link_id, enrolled_by, created_at, updated_at')
    .single()

  if (error) throw new Error(`Failed to enroll lead: ${error.message}`)

  const enrollment = data as AutomationEnrollment
  await queueDayZeroBatchIfNeeded(params.flowId, enrollment)
  return enrollment
}

export async function enrollLead(
  flowId: string,
  leadId: string,
  userId: string,
  userRole?: string
): Promise<AutomationEnrollment> {
  const supabase = createServiceClient()
  const { data: lead } = await supabase.from('leads').select('assigned_to').eq('id', leadId).maybeSingle()
  if (!lead) throw new Error('Lead not found')
  assertTeleCallerCanAccessLead(userRole, userId, (lead as { assigned_to?: string | null }).assigned_to)

  return insertEnrollment({
    flowId,
    leadId,
    enrolledBy: userId,
    source: 'direct',
  })
}

export async function cancelEnrollment(
  enrollmentId: string,
  userId: string,
  userRole?: string
): Promise<void> {
  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('whatsapp_automation_lead_enrollments')
    .select('id, lead_id, leads!inner(assigned_to)')
    .eq('id', enrollmentId)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch enrollment: ${error.message}`)
  if (!row) throw new Error('Enrollment not found')

  const assignedTo = (row as { leads: { assigned_to: string | null } }).leads?.assigned_to
  assertTeleCallerCanAccessLead(userRole, userId, assignedTo)

  const { error: updError } = await supabase
    .from('whatsapp_automation_lead_enrollments')
    // @ts-ignore
    .update({ status: 'cancelled' })
    .eq('id', enrollmentId)

  if (updError) throw new Error(`Failed to cancel enrollment: ${updError.message}`)
}

export async function listBucketLinks(opts?: {
  bucketId?: string
  flowId?: string
  activeOnly?: boolean
}): Promise<AutomationBucketLink[]> {
  const supabase = createServiceClient()
  let query = supabase
    .from('whatsapp_automation_bucket_links')
    .select(
      `
      id, flow_id, bucket_id, linked_by, linked_at, is_active,
      flow:whatsapp_automation_flows ( id, name, cycle_days, is_active ),
      bucket:lead_buckets ( id, name, color )
    `
    )
    .order('linked_at', { ascending: false })

  if (opts?.bucketId) query = query.eq('bucket_id', opts.bucketId)
  if (opts?.flowId) query = query.eq('flow_id', opts.flowId)
  if (opts?.activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw new Error(`Failed to list bucket links: ${error.message}`)
  return (data || []) as AutomationBucketLink[]
}

export async function linkBucketToFlow(
  flowId: string,
  bucketId: string,
  userId: string
): Promise<AutomationBucketLink> {
  const flow = await getFlowById(flowId)
  if (!flow || !flow.is_active) throw new Error('Flow not found or inactive')

  const supabase = createServiceClient()
  const { data: bucket } = await supabase.from('lead_buckets').select('id').eq('id', bucketId).maybeSingle()
  if (!bucket) throw new Error('Bucket not found')

  const { data: link, error } = await supabase
    .from('whatsapp_automation_bucket_links')
    // @ts-ignore
    .upsert(
      {
        flow_id: flowId,
        bucket_id: bucketId,
        linked_by: userId,
        linked_at: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: 'flow_id,bucket_id' }
    )
    .select('id, flow_id, bucket_id, linked_by, linked_at, is_active')
    .single()

  if (error) throw new Error(`Failed to link bucket: ${error.message}`)

  const { data: assignments } = await supabase
    .from('lead_bucket_assignments')
    .select('lead_id')
    .eq('bucket_id', bucketId)

  for (const row of assignments || []) {
    const leadId = (row as { lead_id: string }).lead_id
    try {
      await insertEnrollment({
        flowId,
        leadId,
        enrolledBy: userId,
        source: 'bucket',
        bucketLinkId: (link as AutomationBucketLink).id,
      })
    } catch (e) {
      if (e instanceof Error && (e as Error & { statusCode?: number }).statusCode === 409) continue
      console.error('Bucket link enroll failed for lead', leadId, e)
    }
  }

  return link as AutomationBucketLink
}

export async function unlinkBucketFromFlow(flowId: string, bucketId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('whatsapp_automation_bucket_links')
    // @ts-ignore
    .update({ is_active: false })
    .eq('flow_id', flowId)
    .eq('bucket_id', bucketId)

  if (error) throw new Error(`Failed to unlink bucket: ${error.message}`)
}

export async function autoEnrollLeadFromBucketTag(
  leadId: string,
  bucketId: string,
  taggedBy: string
): Promise<void> {
  const links = await listBucketLinks({ bucketId, activeOnly: true })
  for (const link of links) {
    if (!link.flow?.is_active) continue
    try {
      await insertEnrollment({
        flowId: link.flow_id,
        leadId,
        enrolledBy: taggedBy,
        source: 'bucket',
        bucketLinkId: link.id,
      })
    } catch (e) {
      if (e instanceof Error && (e as Error & { statusCode?: number }).statusCode === 409) continue
      console.error('Auto-enroll from bucket tag failed', leadId, link.flow_id, e)
    }
  }
}

/** Queue immediate batch for day-0 trigger when a lead enrolls. */
async function queueDayZeroBatchIfNeeded(flowId: string, enrollment: AutomationEnrollment): Promise<void> {
  const flow = await getFlowById(flowId)
  if (!flow) return
  const day0 = flow.triggers.find((t) => t.day_offset === 0)
  if (!day0) return

  const { queueTriggerBatchForEnrollments } = await import(
    '@/backend/services/whatsapp-automation-processor.service'
  )
  await queueTriggerBatchForEnrollments({
    flow,
    trigger: day0,
    enrollments: [enrollment],
    runDate: todayIstDateString(),
  })
}

export async function getFlowsForPicker(): Promise<AutomationFlow[]> {
  return listFlows({ activeOnly: true })
}

export function enrollmentCurrentDay(enrollment: AutomationEnrollment, now?: Date): number {
  return computeEnrollmentDay(enrollment.started_at, now)
}
