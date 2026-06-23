'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cachedFetch } from '@/lib/api-client'
import {
  groupBucketsForAnalytics,
  type BucketAnalyticsGroup,
  type BucketWithLeadCount,
} from '@/shared/lead-buckets'
import {
  Layers,
  Users,
  BarChart3,
  ChevronRight,
  ChevronDown,
  FolderTree,
  List,
  RefreshCw,
  GitBranch,
} from 'lucide-react'

interface BucketRow extends BucketWithLeadCount {
  description: string | null
}

interface BucketReportSummary {
  total_buckets: number
  active_buckets: number
  parent_buckets: number
  sub_buckets: number
  parents_with_sub_buckets: number
  unique_leads_tagged: number
  total_leads_in_system: number
  untagged_leads: number
  total_assignments: number
}

type ViewMode = 'tree' | 'table'

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 1000) / 10
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = '#dd3f3c',
}: {
  label: string
  value: number | string
  sub?: string
  icon: typeof Layers
  accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
        <Icon className="w-4 h-4" style={{ color: accent }} />
        {label}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p> : null}
    </div>
  )
}

function DistributionBar({
  value,
  max,
  color,
  className = 'h-2',
}: {
  value: number
  max: number
  color: string
  className?: string
}) {
  const width = max > 0 ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0
  return (
    <div className={`flex-1 bg-gray-100 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </div>
  )
}

function StackedSubBar({
  subBuckets,
  max,
}: {
  subBuckets: BucketWithLeadCount[]
  max: number
}) {
  const total = subBuckets.reduce((s, c) => s + c.lead_count, 0)
  if (total === 0) {
    return <div className="h-2.5 flex-1 bg-gray-100 rounded-full" />
  }
  return (
    <div className="h-2.5 flex-1 flex rounded-full overflow-hidden bg-gray-100">
      {subBuckets.map((sub) => {
        const w = max > 0 ? (sub.lead_count / max) * 100 : 0
        if (sub.lead_count === 0) return null
        return (
          <div
            key={sub.id}
            title={`${sub.name}: ${sub.lead_count}`}
            className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${Math.max(w, sub.lead_count > 0 ? 2 : 0)}%`,
              backgroundColor: sub.color || '#dd3f3c',
            }}
          />
        )
      })}
    </div>
  )
}

function ParentGroupCard({
  group,
  maxRollup,
  taggedTotal,
  expanded,
  onToggle,
}: {
  group: BucketAnalyticsGroup
  maxRollup: number
  taggedTotal: number
  expanded: boolean
  onToggle: () => void
}) {
  const parent = group.parent!
  const barColor = parent.color || '#dd3f3c'
  const sharePct = pct(group.rollup_lead_count, taggedTotal)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-4 hover:bg-gray-50/80 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span
              className="w-1 h-12 rounded-full shrink-0 mt-0.5"
              style={{ backgroundColor: barColor }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-gray-900 truncate">{parent.name}</p>
                <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {group.sub_bucket_count} sub{group.sub_bucket_count !== 1 ? 's' : ''}
                </span>
                {!parent.is_active && (
                  <span className="text-[10px] uppercase text-gray-400">Inactive</span>
                )}
              </div>
              {parent.description ? (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{parent.description}</p>
              ) : null}
              <div className="flex items-center gap-2 mt-3">
                <StackedSubBar subBuckets={group.children} max={maxRollup} />
                <span className="text-xs font-semibold text-[#dd3f3c] w-10 text-right tabular-nums">
                  {group.rollup_lead_count}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {sharePct}% of tagged leads
                {group.direct_parent_leads > 0
                  ? ` · ${group.direct_parent_leads} on parent directly`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-gray-400">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-slate-50/40 divide-y divide-gray-100">
          {group.children.map((sub) => {
            const subColor = sub.color || barColor
            const subPct = pct(sub.lead_count, group.rollup_lead_count)
            return (
              <div key={sub.id} className="px-4 py-3 pl-8 flex items-center gap-3">
                <GitBranch className="w-3.5 h-3.5 text-gray-300 shrink-0 rotate-90" />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: subColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{sub.name}</p>
                    <span className="text-sm font-bold text-[#dd3f3c] tabular-nums shrink-0">
                      {sub.lead_count}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <DistributionBar value={sub.lead_count} max={group.rollup_lead_count} color={subColor} className="h-1.5" />
                    <span className="text-[10px] text-gray-400 w-10 text-right tabular-nums">{subPct}%</span>
                  </div>
                </div>
                <Link
                  href="/buckets"
                  className="text-gray-300 hover:text-[#dd3f3c] shrink-0"
                  aria-label={`Manage ${sub.name}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StandaloneBucketCard({
  bucket,
  maxCount,
  taggedTotal,
}: {
  bucket: BucketWithLeadCount
  maxCount: number
  taggedTotal: number
}) {
  const barColor = bucket.color || '#dd3f3c'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
        <p className="font-semibold text-gray-900 truncate flex-1">{bucket.name}</p>
        <span className="text-lg font-bold text-[#dd3f3c] tabular-nums">{bucket.lead_count}</span>
      </div>
      <div className="flex items-center gap-2">
        <DistributionBar value={bucket.lead_count} max={maxCount} color={barColor} />
        <span className="text-xs text-gray-500 w-12 text-right tabular-nums">
          {pct(bucket.lead_count, taggedTotal)}%
        </span>
      </div>
      {!bucket.is_active && (
        <span className="text-[10px] uppercase text-gray-400 mt-2 inline-block">Inactive</span>
      )}
    </div>
  )
}

export default function BucketAnalyticsReport() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BucketReportSummary | null>(null)
  const [buckets, setBuckets] = useState<BucketRow[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await cachedFetch('/api/reports/buckets', undefined, 0)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to load bucket report')
        setSummary(null)
        setBuckets([])
        return
      }
      setSummary(data.summary ?? null)
      const rows = Array.isArray(data.buckets) ? data.buckets : []
      setBuckets(rows)
      const parentIds = rows
        .filter((b: BucketRow) => !b.parent_id && rows.some((s: BucketRow) => s.parent_id === b.id))
        .map((b: BucketRow) => b.id)
      setExpandedParents(new Set(parentIds))
    } catch {
      setError('Failed to load bucket report')
      setSummary(null)
      setBuckets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchReport()
  }, [fetchReport])

  const groups = useMemo(() => groupBucketsForAnalytics(buckets), [buckets])
  const parentGroups = useMemo(() => groups.filter((g) => g.parent !== null), [groups])
  const standaloneGroups = useMemo(() => groups.filter((g) => g.parent === null), [groups])

  const maxRollup = useMemo(
    () => Math.max(...groups.map((g) => g.rollup_lead_count), 1),
    [groups]
  )
  const maxFlatCount = useMemo(
    () => Math.max(...buckets.map((b) => b.lead_count), 1),
    [buckets]
  )
  const taggedTotal = summary?.unique_leads_tagged ?? 0

  function toggleParent(id: string) {
    setExpandedParents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <RefreshCw className="w-6 h-6 text-[#dd3f3c] animate-spin" />
        <p className="text-sm text-gray-500">Loading bucket analytics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center justify-between gap-3">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => void fetchReport()}
          className="text-xs font-medium underline shrink-0"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Lead bucket analytics</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            See parent buckets and sub-bucket breakdown. Rollup counts sum all leads under a parent group.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'tree' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              Tree
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
          <button
            type="button"
            onClick={() => void fetchReport()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <Link
            href="/buckets"
            className="px-4 py-2 rounded-lg border border-[#e0e0e0] text-sm font-medium text-gray-900 hover:bg-[#fafafa]"
          >
            Manage buckets
          </Link>
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Parents"
            value={summary.parent_buckets}
            sub={`${summary.parents_with_sub_buckets} with subs`}
            icon={Layers}
          />
          <StatCard
            label="Sub-buckets"
            value={summary.sub_buckets}
            sub={`${summary.active_buckets} active total`}
            icon={GitBranch}
            accent="#6366f1"
          />
          <StatCard
            label="Tagged leads"
            value={summary.unique_leads_tagged}
            sub="unique leads"
            icon={Users}
          />
          <StatCard
            label="Untagged"
            value={summary.untagged_leads}
            sub={`of ${summary.total_leads_in_system} total`}
            icon={BarChart3}
            accent="#6b7280"
          />
          <StatCard
            label="Assignments"
            value={summary.total_assignments}
            sub="incl. multi-bucket"
            icon={BarChart3}
            accent="#6b7280"
          />
          <StatCard
            label="All buckets"
            value={summary.total_buckets}
            sub={`${summary.active_buckets} active`}
            icon={Layers}
            accent="#6b7280"
          />
        </div>
      ) : null}

      {buckets.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">No buckets yet</p>
          <p className="text-xs text-gray-500 mt-1">Create parent buckets and sub-buckets from Lead Buckets.</p>
          <Link href="/buckets" className="inline-block mt-4 text-sm text-[#dd3f3c] font-medium hover:underline">
            Go to Lead Buckets →
          </Link>
        </div>
      ) : viewMode === 'tree' ? (
        <div className="space-y-6">
          {parentGroups.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-[#dd3f3c]" />
                Parent groups ({parentGroups.length})
              </h3>
              <div className="space-y-3">
                {parentGroups.map((group) => (
                  <ParentGroupCard
                    key={group.parent!.id}
                    group={group}
                    maxRollup={maxRollup}
                    taggedTotal={taggedTotal}
                    expanded={expandedParents.has(group.parent!.id)}
                    onToggle={() => toggleParent(group.parent!.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {standaloneGroups.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Standalone buckets ({standaloneGroups.reduce((n, g) => n + g.children.length, 0)})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {standaloneGroups.flatMap((g) =>
                  g.children.map((bucket) => (
                    <StandaloneBucketCard
                      key={bucket.id}
                      bucket={bucket}
                      maxCount={maxFlatCount}
                      taggedTotal={taggedTotal}
                    />
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">All buckets (flat)</h3>
            <p className="text-xs text-gray-400">Parent › Sub shown in name</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <th className="px-4 py-3">Bucket</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-center w-24">Leads</th>
                  <th className="px-4 py-3 min-w-[180px]">Share</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {buckets
                  .slice()
                  .sort((a, b) => b.lead_count - a.lead_count)
                  .map((bucket) => {
                    const parent = bucket.parent_id
                      ? buckets.find((p) => p.id === bucket.parent_id)
                      : null
                    const displayName = parent ? `${parent.name} › ${bucket.name}` : bucket.name
                    const barColor = bucket.color || '#dd3f3c'
                    const share = pct(bucket.lead_count, taggedTotal)
                    return (
                      <tr key={bucket.id} className="hover:bg-gray-50/80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: barColor }}
                            />
                            <div>
                              <p className="font-medium text-gray-900">{displayName}</p>
                              {!bucket.is_active && (
                                <span className="text-[10px] uppercase text-gray-400">Inactive</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-full ${
                              bucket.parent_id
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {bucket.parent_id ? 'Sub' : 'Parent'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-[#dd3f3c] tabular-nums">
                          {bucket.lead_count}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <DistributionBar value={bucket.lead_count} max={maxFlatCount} color={barColor} />
                            <span className="text-xs text-gray-500 w-12 text-right tabular-nums">{share}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link href="/buckets" className="inline-flex text-[#dd3f3c] hover:text-[#c93532]">
                            <ChevronRight className="w-5 h-5" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
