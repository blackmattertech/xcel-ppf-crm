/** Shared lead-bucket helpers for UI and services. */

export interface LeadBucketBase {
  id: string
  name: string
  color?: string | null
  parent_id?: string | null
  is_active?: boolean
  sort_order?: number
  description?: string | null
}

export interface LeadBucketWithLabel extends LeadBucketBase {
  label: string
}

/** Buckets a caller can tag on a lead (sub-buckets, or parents without children). */
export function bucketsForLeadAssignment(buckets: LeadBucketBase[]): LeadBucketWithLabel[] {
  const active = buckets.filter((b) => b.is_active !== false)
  const parentIdsWithChildren = new Set(
    active.filter((b) => b.parent_id).map((b) => b.parent_id as string)
  )
  const byId = new Map(active.map((b) => [b.id, b]))

  return active
    .filter((b) => {
      if (b.parent_id) return true
      return !parentIdsWithChildren.has(b.id)
    })
    .map((b) => {
      const parent = b.parent_id ? byId.get(b.parent_id) : null
      return {
        ...b,
        label: parent ? `${parent.name} › ${b.name}` : b.name,
      }
    })
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label)
    )
}

export function groupBucketsForPicker(
  buckets: LeadBucketBase[]
): Array<{ parent: LeadBucketBase | null; items: LeadBucketWithLabel[] }> {
  const assignable = bucketsForLeadAssignment(buckets)
  const byParent = new Map<string | null, LeadBucketWithLabel[]>()

  for (const b of assignable) {
    const key = b.parent_id ?? null
    const list = byParent.get(key) || []
    list.push(b)
    byParent.set(key, list)
  }

  const parents = buckets.filter((b) => !b.parent_id && b.is_active !== false)
  const groups: Array<{ parent: LeadBucketBase | null; items: LeadBucketWithLabel[] }> = []

  for (const parent of parents.sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
  )) {
    const subs = byParent.get(parent.id)
    if (subs?.length) {
      groups.push({ parent, items: subs })
    } else if (assignable.some((a) => a.id === parent.id)) {
      groups.push({
        parent: null,
        items: assignable.filter((a) => a.id === parent.id),
      })
    }
  }

  const orphanSubs = byParent.get(null)?.filter((b) => b.parent_id) || []
  if (orphanSubs.length) {
    groups.push({ parent: null, items: orphanSubs })
  }

  return groups
}

export interface BucketWithLeadCount extends LeadBucketBase {
  lead_count: number
}

export interface BucketAnalyticsGroup {
  /** Parent bucket when this group has sub-buckets; null for standalone top-level buckets */
  parent: BucketWithLeadCount | null
  children: BucketWithLeadCount[]
  rollup_lead_count: number
  sub_bucket_count: number
  /** Leads tagged directly on the parent row (usually 0 when sub-buckets exist) */
  direct_parent_leads: number
}

function sortBuckets(a: LeadBucketBase, b: LeadBucketBase) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
}

/** Group buckets for analytics: parent rollup + sub-bucket breakdown. */
export function groupBucketsForAnalytics(buckets: BucketWithLeadCount[]): BucketAnalyticsGroup[] {
  const childrenByParent = new Map<string, BucketWithLeadCount[]>()
  for (const b of buckets) {
    if (!b.parent_id) continue
    const list = childrenByParent.get(b.parent_id) || []
    list.push(b)
    childrenByParent.set(b.parent_id, list)
  }
  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(parentId, [...children].sort(sortBuckets))
  }

  const topLevel = buckets.filter((b) => !b.parent_id).sort(sortBuckets)
  const groups: BucketAnalyticsGroup[] = []

  for (const parent of topLevel) {
    const children = childrenByParent.get(parent.id) || []
    if (children.length > 0) {
      const direct = parent.lead_count
      const childTotal = children.reduce((sum, c) => sum + c.lead_count, 0)
      groups.push({
        parent,
        children,
        rollup_lead_count: direct + childTotal,
        sub_bucket_count: children.length,
        direct_parent_leads: direct,
      })
    } else {
      groups.push({
        parent: null,
        children: [parent],
        rollup_lead_count: parent.lead_count,
        sub_bucket_count: 0,
        direct_parent_leads: parent.lead_count,
      })
    }
  }

  const knownParentIds = new Set(topLevel.map((b) => b.id))
  const orphans = buckets.filter((b) => b.parent_id && !knownParentIds.has(b.parent_id))
  if (orphans.length > 0) {
    groups.push({
      parent: null,
      children: [...orphans].sort(sortBuckets),
      rollup_lead_count: orphans.reduce((sum, b) => sum + b.lead_count, 0),
      sub_bucket_count: orphans.length,
      direct_parent_leads: 0,
    })
  }

  return groups.sort((a, b) => b.rollup_lead_count - a.rollup_lead_count)
}

