import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type NurtureCampaign = Database['public']['Tables']['nurture_campaigns']['Row']
type NurtureStep = Database['public']['Tables']['nurture_steps']['Row']
type NurtureEnrollment = Database['public']['Tables']['nurture_enrollments']['Row']

export interface CampaignStep {
  stepOrder: number
  stepType: 'email' | 'sms' | 'whatsapp' | 'delay' | 'action'
  delayHours: number
  content?: {
    subject?: string
    body?: string
    template?: string
  }
  actionType?: string
  actionData?: Record<string, any>
}

export interface CreateCampaignData {
  name: string
  description?: string
  campaignType: 'drip' | 'trigger' | 're_engagement'
  triggerCondition?: {
    leadStatus?: string[]
    daysSinceLastActivity?: number
    interestLevel?: string[]
  }
  steps: CampaignStep[]
}

/**
 * Create a nurture campaign
 */
export async function createNurtureCampaign(
  data: CreateCampaignData,
  createdBy: string
): Promise<NurtureCampaign> {
  const supabase = createServiceClient()

  // Create campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('nurture_campaigns')
    .insert({
      name: data.name,
      description: data.description || null,
      campaign_type: data.campaignType,
      trigger_condition: data.triggerCondition || null,
      is_active: true,
      created_by: createdBy,
    })
    .select()
    .single()

  if (campaignError || !campaign) {
    throw new Error(`Failed to create campaign: ${campaignError?.message}`)
  }

  // Create steps
  if (data.steps && data.steps.length > 0) {
    const stepsToInsert = data.steps.map((step, index) => ({
      campaign_id: campaign.id,
      step_order: step.stepOrder || index + 1,
      step_type: step.stepType,
      delay_hours: step.delayHours || 0,
      content: step.content || null,
      action_type: step.actionType || null,
      action_data: step.actionData || null,
      is_active: true,
    }))

    const { error: stepsError } = await supabase.from('nurture_steps').insert(stepsToInsert as any)

    if (stepsError) {
      // Rollback campaign creation
      await supabase.from('nurture_campaigns').delete().eq('id', campaign.id)
      throw new Error(`Failed to create campaign steps: ${stepsError.message}`)
    }
  }

  return campaign as NurtureCampaign
}

/**
 * Enroll a lead in a campaign
 */
export async function enrollLeadInCampaign(
  leadId: string,
  campaignId: string
): Promise<NurtureEnrollment> {
  const supabase = createServiceClient()

  // Check if already enrolled
  const { data: existing } = await supabase
    .from('nurture_enrollments')
    .select('*')
    .eq('lead_id', leadId)
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .single()

  if (existing) {
    return existing as NurtureEnrollment
  }

  // Get first step
  const { data: firstStep } = await supabase
    .from('nurture_steps')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('step_order', { ascending: true })
    .limit(1)
    .single()

  // Calculate next step scheduled time
  const nextScheduled = firstStep
    ? new Date(Date.now() + (firstStep.delay_hours || 0) * 60 * 60 * 1000)
    : null

  // Create enrollment
  const { data: enrollment, error } = await supabase
    .from('nurture_enrollments')
    .insert({
      lead_id: leadId,
      campaign_id: campaignId,
      current_step_id: firstStep?.id || null,
      status: 'active',
      next_step_scheduled_at: nextScheduled?.toISOString() || null,
    })
    .select()
    .single()

  if (error || !enrollment) {
    throw new Error(`Failed to enroll lead: ${error?.message}`)
  }

  return enrollment as NurtureEnrollment
}

/**
 * Process pending nurture steps (background job)
 */
export async function processPendingNurtureSteps(): Promise<number> {
  const supabase = createServiceClient()

  // Call database function
  const { data: processedCount, error } = await supabase.rpc('process_pending_nurture_steps')

  if (error) {
    console.error('Failed to process nurture steps:', error)
    return 0
  }

  // Get pending executions and process them
  const { data: pendingExecutions } = await supabase
    .from('nurture_step_executions')
    .select(`
      *,
      step:nurture_steps (*),
      enrollment:nurture_enrollments (
        *,
        lead:leads (*)
      )
    `)
    .eq('execution_status', 'pending')
    .order('executed_at', { ascending: true })
    .limit(50)

  if (!pendingExecutions || pendingExecutions.length === 0) {
    return processedCount || 0
  }

  // Process each execution
  for (const execution of pendingExecutions) {
    const step = execution.step as any
    const enrollment = execution.enrollment as any
    const lead = enrollment?.lead as any

    if (!step || !lead) continue

    try {
      // Execute step based on type
      if (step.step_type === 'email') {
        // TODO: Send email (Phase 5 integration)
        await updateExecutionStatus(execution.id, 'sent', { sentAt: new Date().toISOString() })
      } else if (step.step_type === 'sms') {
        // TODO: Send SMS (Phase 5 integration)
        await updateExecutionStatus(execution.id, 'sent', { sentAt: new Date().toISOString() })
      } else if (step.step_type === 'whatsapp') {
        // TODO: Send WhatsApp (Phase 5 integration)
        await updateExecutionStatus(execution.id, 'sent', { sentAt: new Date().toISOString() })
      } else if (step.step_type === 'action') {
        // Execute action
        await executeNurtureAction(lead.id, step.action_type, step.action_data)
        await updateExecutionStatus(execution.id, 'sent', { executedAt: new Date().toISOString() })
      } else if (step.step_type === 'delay') {
        // Delay step - just mark as sent
        await updateExecutionStatus(execution.id, 'sent', { executedAt: new Date().toISOString() })
      }
    } catch (error) {
      console.error(`Failed to execute step ${execution.id}:`, error)
      await updateExecutionStatus(execution.id, 'failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return processedCount || 0
}

/**
 * Update execution status
 */
async function updateExecutionStatus(
  executionId: string,
  status: 'sent' | 'delivered' | 'failed' | 'skipped',
  metadata?: Record<string, any>
): Promise<void> {
  const supabase = createServiceClient()

  await supabase
    .from('nurture_step_executions')
    .update({
      execution_status: status,
      executed_at: status !== 'pending' ? new Date().toISOString() : null,
      error_message: status === 'failed' ? metadata?.errorMessage || null : null,
      metadata: metadata || null,
    })
    .eq('id', executionId)
}

/**
 * Execute nurture action
 */
async function executeNurtureAction(
  leadId: string,
  actionType: string | null,
  actionData: Record<string, any> | null
): Promise<void> {
  const supabase = createServiceClient()

  if (!actionType) return

  switch (actionType) {
    case 'create_followup':
      if (actionData?.scheduled_at && actionData?.assigned_to) {
        await supabase.from('follow_ups').insert({
          lead_id: leadId,
          assigned_to: actionData.assigned_to,
          scheduled_at: actionData.scheduled_at,
          notes: actionData.notes || 'Auto-created from nurture campaign',
          status: 'pending',
        } as any)
      }
      break

    case 'update_status':
      if (actionData?.status) {
        await supabase
          .from('leads')
          .update({
            status: actionData.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId)
      }
      break

    case 'assign_user':
      if (actionData?.user_id) {
        await supabase
          .from('leads')
          .update({
            assigned_to: actionData.user_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId)
      }
      break

    default:
      console.warn(`Unknown action type: ${actionType}`)
  }
}

/**
 * Get campaigns
 */
export async function getNurtureCampaigns(filters?: { isActive?: boolean }) {
  const supabase = createServiceClient()

  let query = supabase
    .from('nurture_campaigns')
    .select(`
      *,
      steps:nurture_steps (*)
    `)
    .order('created_at', { ascending: false })

  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data || []
}

/**
 * Get lead enrollments
 */
export async function getLeadEnrollments(leadId: string) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('nurture_enrollments')
    .select(`
      *,
      campaign:nurture_campaigns (*),
      executions:nurture_step_executions (
        *,
        step:nurture_steps (*)
      )
    `)
    .eq('lead_id', leadId)
    .order('enrolled_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch enrollments: ${error.message}`)
  }

  return data || []
}

/**
 * Pause or cancel enrollment
 */
export async function updateEnrollmentStatus(
  enrollmentId: string,
  status: 'active' | 'paused' | 'cancelled'
): Promise<void> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('nurture_enrollments')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)

  if (error) {
    throw new Error(`Failed to update enrollment: ${error.message}`)
  }
}

/**
 * Auto-enroll leads based on trigger conditions
 */
export async function autoEnrollLeadsInTriggerCampaigns(): Promise<number> {
  const supabase = createServiceClient()
  let enrolledCount = 0

  // Get active trigger campaigns
  const { data: campaigns } = await supabase
    .from('nurture_campaigns')
    .select('*')
    .eq('campaign_type', 'trigger')
    .eq('is_active', true)

  if (!campaigns || campaigns.length === 0) {
    return 0
  }

  for (const campaign of campaigns) {
    const triggerCondition = campaign.trigger_condition as any
    if (!triggerCondition) continue

    // Build query based on trigger conditions
    let query = supabase.from('leads').select('id')

    // Status condition
    if (triggerCondition.leadStatus && Array.isArray(triggerCondition.leadStatus)) {
      query = query.in('status', triggerCondition.leadStatus)
    }

    // Interest level condition
    if (triggerCondition.interestLevel && Array.isArray(triggerCondition.interestLevel)) {
      query = query.in('interest_level', triggerCondition.interestLevel)
    }

    // Days since last activity
    if (triggerCondition.daysSinceLastActivity) {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - triggerCondition.daysSinceLastActivity)
      query = query.or(
        `first_contact_at.is.null,first_contact_at.lt.${cutoffDate.toISOString()}`
      )
    }

    // Exclude already enrolled leads
    const { data: enrolledLeads } = await supabase
      .from('nurture_enrollments')
      .select('lead_id')
      .eq('campaign_id', campaign.id)
      .eq('status', 'active')

    const enrolledLeadIds = enrolledLeads?.map((e) => e.lead_id) || []
    if (enrolledLeadIds.length > 0) {
      query = query.not('id', 'in', `(${enrolledLeadIds.join(',')})`)
    }

    const { data: leads } = await query

    if (leads) {
      for (const lead of leads) {
        try {
          await enrollLeadInCampaign(lead.id, campaign.id)
          enrolledCount++
        } catch (error) {
          console.error(`Failed to enroll lead ${lead.id}:`, error)
        }
      }
    }
  }

  return enrolledCount
}
