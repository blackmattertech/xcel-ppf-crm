import { createServiceClient } from '@/lib/supabase/service'

export interface LeadBucket {
  id: string
  name: string
  description: string | null
  color: string | null
  is_active: boolean
  sort_order: number
  parent_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadBucketWithStats extends LeadBucket {
  lead_count: number
}

export interface BucketReportSummary {
  total_buckets: number
  active_buckets: number
  parent_buckets: number
  sub_buckets: number
  parents_with_sub_buckets: number
  /** Unique leads with at least one bucket tag */
  unique_leads_tagged: number
  total_leads_in_system: number
  untagged_leads: number
  /** Sum of all bucket assignments (lead in 2 buckets = 2) */
  total_assignments: number
}

export interface BucketReportPayload {
  summary: BucketReportSummary
  buckets: LeadBucketWithStats[]
}

export const DEFAULT_BUCKET_COLOR = '#dd3f3c'

export interface BucketLeadSummary {
  id: string
  lead_id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  assigned_to: string | null
  created_at: string
  assigned_user?: { id: string; name: string | null } | null
}

export interface CreateBucketInput {
  name: string
  description?: string
  color?: string
  is_active?: boolean
  sort_order?: number
  parent_id?: string | null
  created_by: string
}

export interface UpdateBucketInput {
  name?: string
  description?: string | null
  color?: string | null
  is_active?: boolean
  sort_order?: number
  parent_id?: string | null
}

/** Sub-bucket IDs under a parent (active or inactive). */
export async function getChildBucketIds(parentId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('lead_buckets')
    .select('id')
    .eq('parent_id', parentId)

  if (error) throw new Error(`Failed to fetch sub-buckets: ${error.message}`)
  return ((data || []) as { id: string }[]).map((r) => r.id)
}

/** On lead tag: check flow links on this bucket and parent (if sub-bucket). */
export async function resolveAutomationBucketIdsForTag(bucketId: string): Promise<string[]> {
  const bucket = await getBucketById(bucketId)
  if (!bucket) return [bucketId]
  if (bucket.parent_id) return [...new Set([bucketId, bucket.parent_id])]
  return [bucketId]
}

/** On flow link: enroll leads in bucket and all sub-buckets when parent is linked. */
export async function resolveAutomationBucketIdsForEnrollment(bucketId: string): Promise<string[]> {
  const bucket = await getBucketById(bucketId)
  if (!bucket) return [bucketId]
  if (bucket.parent_id) return [bucketId]
  const children = await getChildBucketIds(bucketId)
  return [...new Set([bucketId, ...children])]
}

async function assertValidParentBucket(parentId: string | null | undefined): Promise<void> {
  if (!parentId) return
  const parent = await getBucketById(parentId)
  if (!parent) throw new Error('Parent bucket not found')
  if (!parent.is_active) throw new Error('Parent bucket is inactive')
  if (parent.parent_id) throw new Error('Sub-buckets cannot be nested more than one level')
}

function assertTeleCallerCanViewLead(
  userRole: string | undefined,
  userId: string | undefined,
  assignedTo: string | null | undefined
) {
  if (userRole === 'tele_caller' && userId && assignedTo !== userId) {
    throw new Error('Forbidden: You can only modify leads assigned to you')
  }
}

export async function getAllBuckets(options?: { activeOnly?: boolean }): Promise<LeadBucket[]> {
  const supabase = createServiceClient()
  let query = supabase
    .from('lead_buckets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (options?.activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to fetch buckets: ${error.message}`)
  }
  return (data || []) as LeadBucket[]
}

export async function getBucketById(id: string): Promise<LeadBucket | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('lead_buckets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch bucket: ${error.message}`)
  }
  return data as LeadBucket | null
}

export async function getBucketsWithStats(): Promise<LeadBucketWithStats[]> {
  const supabase = createServiceClient()

  const { data: buckets, error: bucketsError } = await supabase
    .from('lead_buckets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (bucketsError) {
    throw new Error(`Failed to fetch buckets: ${bucketsError.message}`)
  }

  const { data: assignments, error: assignError } = await supabase
    .from('lead_bucket_assignments')
    .select('bucket_id')

  if (assignError) {
    throw new Error(`Failed to fetch bucket assignments: ${assignError.message}`)
  }

  const countByBucket = new Map<string, number>()
  for (const row of (assignments || []) as { bucket_id: string }[]) {
    const bucketId = row.bucket_id
    countByBucket.set(bucketId, (countByBucket.get(bucketId) || 0) + 1)
  }

  return ((buckets || []) as LeadBucket[]).map((bucket) => ({
    ...bucket,
    lead_count: countByBucket.get(bucket.id) || 0,
  }))
}

export async function getBucketReport(): Promise<BucketReportPayload> {
  const supabase = createServiceClient()
  const buckets = await getBucketsWithStats()

  const { count: totalLeads, error: leadsError } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })

  if (leadsError) {
    throw new Error(`Failed to count leads: ${leadsError.message}`)
  }

  const { data: assignments, error: assignError } = await supabase
    .from('lead_bucket_assignments')
    .select('lead_id, bucket_id')

  if (assignError) {
    throw new Error(`Failed to fetch bucket assignments: ${assignError.message}`)
  }

  const typedAssignments = (assignments || []) as { lead_id: string; bucket_id: string }[]
  const uniqueTagged = new Set(typedAssignments.map((r) => r.lead_id)).size
  const totalInSystem = totalLeads ?? 0
  const parentBuckets = buckets.filter((b) => !b.parent_id)
  const subBuckets = buckets.filter((b) => b.parent_id)
  const parentIdsWithChildren = new Set(subBuckets.map((b) => b.parent_id as string))

  return {
    summary: {
      total_buckets: buckets.length,
      active_buckets: buckets.filter((b) => b.is_active).length,
      parent_buckets: parentBuckets.length,
      sub_buckets: subBuckets.length,
      parents_with_sub_buckets: parentBuckets.filter((b) => parentIdsWithChildren.has(b.id)).length,
      unique_leads_tagged: uniqueTagged,
      total_leads_in_system: totalInSystem,
      untagged_leads: Math.max(0, totalInSystem - uniqueTagged),
      total_assignments: typedAssignments.length,
    },
    buckets,
  }
}

export async function getBucketLeads(
  bucketId: string,
  userId?: string,
  userRole?: string
): Promise<BucketLeadSummary[]> {
  const supabase = createServiceClient()

  const bucket = await getBucketById(bucketId)
  if (!bucket) {
    throw new Error('Bucket not found')
  }

  const { data: assignmentRows, error: assignError } = await supabase
    .from('lead_bucket_assignments')
    .select('lead_id')
    .eq('bucket_id', bucketId)

  if (assignError) {
    throw new Error(`Failed to fetch bucket leads: ${assignError.message}`)
  }

  const leadIds = (assignmentRows || []).map((r) => (r as { lead_id: string }).lead_id)
  if (leadIds.length === 0) {
    return []
  }

  let query = supabase
    .from('leads')
    .select(`
      id,
      lead_id,
      name,
      phone,
      email,
      status,
      assigned_to,
      created_at,
      assigned_user:users!leads_assigned_to_fkey (id, name)
    `)
    .in('id', leadIds)
    .order('created_at', { ascending: false })

  if (userRole === 'tele_caller' && userId) {
    query = query.eq('assigned_to', userId)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to fetch bucket leads: ${error.message}`)
  }

  return (data || []) as BucketLeadSummary[]
}

export async function createBucket(input: CreateBucketInput): Promise<LeadBucket> {
  await assertValidParentBucket(input.parent_id ?? null)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('lead_buckets')
    // @ts-ignore - table not in generated Database types yet
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color || DEFAULT_BUCKET_COLOR,
      is_active: input.is_active !== undefined ? input.is_active : true,
      sort_order: input.sort_order ?? 0,
      parent_id: input.parent_id ?? null,
      created_by: input.created_by,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create bucket: ${error.message}`)
  }
  return data as LeadBucket
}

export async function updateBucket(id: string, input: UpdateBucketInput): Promise<LeadBucket> {
  if (input.parent_id !== undefined) {
    if (input.parent_id === id) throw new Error('Bucket cannot be its own parent')
    await assertValidParentBucket(input.parent_id)
  }

  const supabase = createServiceClient()
  const updateData: Record<string, unknown> = {}
  if (input.name !== undefined) updateData.name = input.name.trim()
  if (input.description !== undefined) updateData.description = input.description
  if (input.color !== undefined) updateData.color = input.color
  if (input.is_active !== undefined) updateData.is_active = input.is_active
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order
  if (input.parent_id !== undefined) updateData.parent_id = input.parent_id

  const { data, error } = await supabase
    .from('lead_buckets')
    // @ts-ignore
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update bucket: ${error.message}`)
  }
  return data as LeadBucket
}

export async function deleteBucket(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('lead_buckets').delete().eq('id', id)
  if (error) {
    throw new Error(`Failed to delete bucket: ${error.message}`)
  }
}

export async function getLeadBuckets(
  leadId: string,
  userId?: string,
  userRole?: string
): Promise<LeadBucket[]> {
  const supabase = createServiceClient()

  const { data: stub, error: stubErr } = await supabase
    .from('leads')
    .select('assigned_to')
    .eq('id', leadId)
    .maybeSingle()

  if (stubErr) {
    throw new Error(`Failed to fetch lead: ${stubErr.message}`)
  }
  if (!stub) {
    throw new Error('Lead not found')
  }

  assertTeleCallerCanViewLead(userRole, userId, (stub as { assigned_to?: string | null }).assigned_to)

  const { data, error } = await supabase
    .from('lead_bucket_assignments')
    .select(`
      bucket:lead_buckets (
        id,
        name,
        description,
        color,
        is_active,
        sort_order,
        parent_id,
        created_by,
        created_at,
        updated_at
      )
    `)
    .eq('lead_id', leadId)

  if (error) {
    throw new Error(`Failed to fetch lead buckets: ${error.message}`)
  }

  return (data || [])
    .map((row) => (row as { bucket: LeadBucket | null }).bucket)
    .filter((b): b is LeadBucket => Boolean(b))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
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

  if (stubErr) {
    throw new Error(`Failed to fetch lead: ${stubErr.message}`)
  }
  if (!stub) {
    throw new Error('Lead not found')
  }

  assertTeleCallerCanViewLead(userRole, userId, (stub as { assigned_to?: string | null }).assigned_to)

  const uniqueBucketIds = [...new Set(bucketIds)]

  if (uniqueBucketIds.length > 0) {
    const { data: validBuckets, error: validError } = await supabase
      .from('lead_buckets')
      .select('id')
      .in('id', uniqueBucketIds)
      .eq('is_active', true)

    if (validError) {
      throw new Error(`Failed to validate buckets: ${validError.message}`)
    }

    const validIds = new Set(((validBuckets || []) as { id: string }[]).map((b) => b.id))
    const invalid = uniqueBucketIds.filter((id) => !validIds.has(id))
    if (invalid.length > 0) {
      throw new Error('One or more buckets are invalid or inactive')
    }
  }

  const { error: deleteError } = await supabase
    .from('lead_bucket_assignments')
    .delete()
    .eq('lead_id', leadId)

  if (deleteError) {
    throw new Error(`Failed to update lead buckets: ${deleteError.message}`)
  }

  if (uniqueBucketIds.length > 0) {
    const rows = uniqueBucketIds.map((bucketId) => ({
      lead_id: leadId,
      bucket_id: bucketId,
      assigned_by: assignedBy,
    }))

    const { error: insertError } = await supabase
      .from('lead_bucket_assignments')
      // @ts-ignore
      .insert(rows)

    if (insertError) {
      throw new Error(`Failed to assign buckets: ${insertError.message}`)
    }
  }

  return getLeadBuckets(leadId, userId, userRole)
}
