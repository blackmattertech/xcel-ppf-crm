import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type LeadActivity = Database['public']['Tables']['lead_activities']['Row']

export interface CreateActivityData {
  leadId: string
  activityType:
    | 'call'
    | 'email'
    | 'sms'
    | 'whatsapp'
    | 'meeting'
    | 'note'
    | 'status_change'
    | 'assignment'
    | 'followup_created'
    | 'followup_completed'
    | 'quotation_sent'
    | 'quotation_viewed'
    | 'quotation_accepted'
    | 'file_uploaded'
    | 'custom'
  activitySubtype?: string
  title: string
  description?: string
  performedBy?: string
  metadata?: Record<string, any>
  relatedEntityType?: string
  relatedEntityId?: string
}

/**
 * Create a lead activity
 */
export async function createLeadActivity(data: CreateActivityData): Promise<LeadActivity> {
  const supabase = createServiceClient()

  const { data: activity, error } = await supabase
    .from('lead_activities')
    .insert({
      lead_id: data.leadId,
      activity_type: data.activityType,
      activity_subtype: data.activitySubtype || null,
      title: data.title,
      description: data.description || null,
      performed_by: data.performedBy || null,
      performed_at: new Date().toISOString(),
      metadata: data.metadata || null,
      related_entity_type: data.relatedEntityType || null,
      related_entity_id: data.relatedEntityId || null,
    })
    .select()
    .single()

  if (error || !activity) {
    throw new Error(`Failed to create activity: ${error?.message}`)
  }

  return activity as LeadActivity
}

/**
 * Get activities for a lead
 */
export async function getLeadActivities(
  leadId: string,
  filters?: {
    activityType?: string
    limit?: number
    offset?: number
    startDate?: string
    endDate?: string
  }
) {
  const supabase = createServiceClient()

  let query = supabase
    .from('lead_activities')
    .select(`
      *,
      performed_by_user:users!lead_activities_performed_by_fkey (
        id,
        name,
        email,
        profile_image_url
      )
    `)
    .eq('lead_id', leadId)
    .order('performed_at', { ascending: false })

  if (filters?.activityType) {
    query = query.eq('activity_type', filters.activityType)
  }

  if (filters?.startDate) {
    query = query.gte('performed_at', filters.startDate)
  }

  if (filters?.endDate) {
    query = query.lte('performed_at', filters.endDate)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch activities: ${error.message}`)
  }

  return data || []
}

/**
 * Get activity summary for a lead
 */
export async function getLeadActivitySummary(leadId: string) {
  const supabase = createServiceClient()

  // Get activity counts by type
  const { data: activities } = await supabase
    .from('lead_activities')
    .select('activity_type, performed_at')
    .eq('lead_id', leadId)

  if (!activities) {
    return {
      total: 0,
      byType: {},
      lastActivity: null,
      firstActivity: null,
    }
  }

  const byType: Record<string, number> = {}
  let lastActivity: string | null = null
  let firstActivity: string | null = null

  for (const activity of activities) {
    byType[activity.activity_type] = (byType[activity.activity_type] || 0) + 1

    const performedAt = activity.performed_at
    if (performedAt) {
      if (!lastActivity || performedAt > lastActivity) {
        lastActivity = performedAt
      }
      if (!firstActivity || performedAt < firstActivity) {
        firstActivity = performedAt
      }
    }
  }

  return {
    total: activities.length,
    byType,
    lastActivity,
    firstActivity,
  }
}

/**
 * Log email activity
 */
export async function logEmailActivity(
  leadId: string,
  direction: 'sent' | 'received',
  subject: string,
  performedBy?: string,
  metadata?: Record<string, any>
): Promise<LeadActivity> {
  return createLeadActivity({
    leadId,
    activityType: 'email',
    activitySubtype: `email_${direction}`,
    title: direction === 'sent' ? 'Email Sent' : 'Email Received',
    description: subject,
    performedBy,
    metadata: {
      ...metadata,
      direction,
      subject,
    },
  })
}

/**
 * Log SMS activity
 */
export async function logSMSActivity(
  leadId: string,
  direction: 'sent' | 'received',
  message: string,
  performedBy?: string,
  metadata?: Record<string, any>
): Promise<LeadActivity> {
  return createLeadActivity({
    leadId,
    activityType: 'sms',
    activitySubtype: `sms_${direction}`,
    title: direction === 'sent' ? 'SMS Sent' : 'SMS Received',
    description: message.substring(0, 100), // First 100 chars
    performedBy,
    metadata: {
      ...metadata,
      direction,
      message,
    },
  })
}

/**
 * Log WhatsApp activity
 */
export async function logWhatsAppActivity(
  leadId: string,
  direction: 'sent' | 'received',
  message: string,
  performedBy?: string,
  metadata?: Record<string, any>
): Promise<LeadActivity> {
  return createLeadActivity({
    leadId,
    activityType: 'whatsapp',
    activitySubtype: `whatsapp_${direction}`,
    title: direction === 'sent' ? 'WhatsApp Sent' : 'WhatsApp Received',
    description: message.substring(0, 100),
    performedBy,
    metadata: {
      ...metadata,
      direction,
      message,
    },
  })
}

/**
 * Log note activity
 */
export async function logNoteActivity(
  leadId: string,
  note: string,
  performedBy: string
): Promise<LeadActivity> {
  return createLeadActivity({
    leadId,
    activityType: 'note',
    title: 'Note Added',
    description: note,
    performedBy,
  })
}

/**
 * Log meeting activity
 */
export async function logMeetingActivity(
  leadId: string,
  title: string,
  scheduledAt: string,
  performedBy: string,
  metadata?: Record<string, any>
): Promise<LeadActivity> {
  return createLeadActivity({
    leadId,
    activityType: 'meeting',
    title: 'Meeting Scheduled',
    description: title,
    performedBy,
    metadata: {
      ...metadata,
      scheduledAt,
    },
  })
}
