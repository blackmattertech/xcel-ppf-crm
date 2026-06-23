import { createServiceClient } from '@/lib/supabase/service'

export interface LeadBucket {
  id: string
  name: string
  description: string | null
  color: string
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadBucketWithStats extends LeadBucket {
  lead_count: number
}

export interface LeadBucketLeadRow {
  id: string
  lead_id: string
  name: string
  phone: string
  email: string | null
  status: string
  assigned_to: string | null
  created_at: string
  assigned_user: { id: string; name: string } | null
  tagged_at: string
}

export interface LeadBucketDetail extends LeadBucket {
  lead_count: number
  leads: LeadBucketLeadRow[]
}

export interface CreateLeadBucketInput {
  name: string
  description?: string
  color?: string
  sort_order?: number
  is_active?: boolean
  created_by: string
}

export interface UpdateLeadBucketInput {
  name?: string
  description?: string | null
  color?: string
  sort_order?: number
  is_active?: boolean
}

const BUCKET_SELECT = `
  id,
  name,
  description,
  color,
  sort_order,
  is_active,
  created_by,
  created_at,
  updated_at
`

function assertTeleCallerCanAccessLead(
  userRole: string | undefined,
  userId: string | undefined,
  assignedTo: string | null | undefined
) {
  if (userRole === 'tele_caller' && userId && assignedTo !== userId) {
    throw new Error('Forbidden: You can only tag leads assigned to you')
  }
}

export async function getAllLeadBuckets(activeOnly = false): Promise<LeadBucket[]> {
  const supabase = createServiceClient()
  let query = supabase
    .from('lead_buckets')
    .select(BUCKET_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch lead buckets: ${error.message}`)
  return (data || []) as LeadBucket[]
}

export async function getLeadBucketsWithStats(): Promise<LeadBucketWithStats[]> {
  const supabase = createServiceClient()

  const { data: buckets, error: bucketsError } = await supabase
    .from('lead_buckets')
    .select(BUCKET_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (bucketsError) throw new Error(`Failed to fetch lead buckets: ${bucketsError.message}`)

  const { data: assignments, error: assignmentsError } = await supabase
    .from('lead_bucket_assignments')
    .select('bucket_id')

  if (assignmentsError) {
    throw new Error(`Failed to fetch bucket assignments: ${assignmentsError.message}`)
  }

  const countByBucket = new Map<string, number>()
  for (const row of assignments || []) {
    const bid = (row as { bucket_id: string }).bucket_id
    countByBucket.set(bid, (countByBucket.get(bid) || 0) + 1)
  }

  return ((buckets || []) as LeadBucket[]).map((b) => ({
    ...b,
    lead_count: countByBucket.get(b.id) || 0,
  }))
}

export async function getLeadBucketById(id: string): Promise<LeadBucket | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('lead_buckets').select(BUCKET_SELECT).eq('id', id).single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to fetch lead bucket: ${error.message}`)
  }
  return data as LeadBucket
}

export async function getLeadBucketDetail(
  id: string,
  opts?: { userId?: string; userRole?: string }
): Promise<LeadBucketDetail | null> {
  const bucket = await getLeadBucketById(id)
  if (!bucket) return null

  const supabase = createServiceClient()
  const { data: assignments, error } = await supabase
    .from('lead_bucket_assignments')
    .select(
      `
      created_at,
      lead:leads (
        id,
        lead_id,
        name,
        phone,
        email,
        status,
        assigned_to,
        created_at,
        assigned_user:users!leads_assigned_to_fkey ( id, name )
      )
    `
    )
    .eq('bucket_id', id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch bucket leads: ${error.message}`)

  const leads: LeadBucketLeadRow[] = []
  for (const row of assignments || []) {
    const typed = row as { lead: LeadBucketLeadRow | null; created_at: string }
    const lead = typed.lead
    if (!lead) continue
    if (opts?.userRole === 'tele_caller' && opts.userId && lead.assigned_to !== opts.userId) continue
    leads.push({ ...lead, tagged_at: typed.created_at })
  }

  return { ...bucket, lead_count: leads.length, leads }
}

export async function createLeadBucket(input: CreateLeadBucketInput): Promise<LeadBucket> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('lead_buckets')
    // @ts-ignore
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color || '#6366f1',
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active !== undefined ? input.is_active : true,
      created_by: input.created_by,
    })
    .select(BUCKET_SELECT)
    .single()

  if (error) throw new Error(`Failed to create lead bucket: ${error.message}`)
  return data as LeadBucket
}

export async function updateLeadBucket(id: string, input: UpdateLeadBucketInput): Promise<LeadBucket> {
  const supabase = createServiceClient()
  const updateData: Record<string, unknown> = {}
  if (input.name !== undefined) updateData.name = input.name.trim()
  if (input.description !== undefined) updateData.description = input.description?.trim() || null
  if (input.color !== undefined) updateData.color = input.color
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order
  if (input.is_active !== undefined) updateData.is_active = input.is_active

  const { data, error } = await supabase
    .from('lead_buckets')
    // @ts-ignore
    .update(updateData)
    .eq('id', id)
    .select(BUCKET_SELECT)
    .single()

  if (error) throw new Error(`Failed to update lead bucket: ${error.message}`)
  return data as LeadBucket
}

export async function deleteLeadBucket(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('lead_buckets').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete lead bucket: ${error.message}`)
}

export async function getBucketsForLead(leadId: string): Promise<LeadBucket[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('lead_bucket_assignments')
    .select(`bucket:lead_buckets (${BUCKET_SELECT})`)
    .eq('lead_id', leadId)

  if (error) throw new Error(`Failed to fetch lead buckets: ${error.message}`)

  const buckets: LeadBucket[] = []
  for (const row of data || []) {
    const bucket = (row as { bucket: LeadBucket | null }).bucket
    if (bucket) buckets.push(bucket)
  }
  return buckets.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export async function setLeadBuckets(
  leadId: string,
  bucketIds: string[],
  assignedBy: string,
  userId?: string,
  userRole?: string
): Promise<LeadBucket[]> {
  const supabase = createServiceClient()

  const { data: stub, error: stubErr } = await supabase
    .from('leads')
    .select('assigned_to')
    .eq('id', leadId)
    .maybeSingle()

  if (stubErr) throw new Error(`Failed to fetch lead: ${stubErr.message}`)
  if (!stub) throw new Error('Lead not found')

  assertTeleCallerCanAccessLead(userRole, userId, (stub as { assigned_to?: string | null }).assigned_to)

  const uniqueIds = [...new Set(bucketIds)]

  if (uniqueIds.length > 0) {
    const { data: validBuckets, error: validError } = await supabase
      .from('lead_buckets')
      .select('id')
      .in('id', uniqueIds)
      .eq('is_active', true)

    if (validError) throw new Error(`Failed to validate buckets: ${validError.message}`)

    const validIds = new Set((validBuckets || []).map((b) => (b as { id: string }).id))
    const invalid = uniqueIds.filter((id) => !validIds.has(id))
    if (invalid.length > 0) throw new Error('One or more bucket IDs are invalid or inactive')
  }

  const previousBuckets = await getBucketsForLead(leadId)
  const previousIds = new Set(previousBuckets.map((b) => b.id))

  const { error: deleteError } = await supabase.from('lead_bucket_assignments').delete().eq('lead_id', leadId)
  if (deleteError) throw new Error(`Failed to clear bucket assignments: ${deleteError.message}`)

  if (uniqueIds.length > 0) {
    const rows = uniqueIds.map((bucketId) => ({
      lead_id: leadId,
      bucket_id: bucketId,
      assigned_by: assignedBy,
    }))
    const { error: insertError } = await supabase
      .from('lead_bucket_assignments')
      // @ts-ignore
      .insert(rows)
    if (insertError) throw new Error(`Failed to assign buckets: ${insertError.message}`)
  }

  const newlyAdded = uniqueIds.filter((id) => !previousIds.has(id))
  if (newlyAdded.length > 0) {
    const { autoEnrollLeadFromBucketTag } = await import('@/backend/services/whatsapp-automation.service')
    for (const bucketId of newlyAdded) {
      try {
        await autoEnrollLeadFromBucketTag(leadId, bucketId, assignedBy)
      } catch (e) {
        console.error('WhatsApp automation auto-enroll failed', leadId, bucketId, e)
      }
    }
  }

  return getBucketsForLead(leadId)
}
