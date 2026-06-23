'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cachedFetch } from '@/lib/api-client'
import { Layers, Users, BarChart3, ChevronRight } from 'lucide-react'

interface BucketRow {
  id: string
  name: string
  description: string | null
  color: string | null
  is_active: boolean
  lead_count: number
}

interface BucketReportSummary {
  total_buckets: number
  active_buckets: number
  unique_leads_tagged: number
  total_leads_in_system: number
  untagged_leads: number
  total_assignments: number
}

export default function BucketAnalyticsReport() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BucketReportSummary | null>(null)
  const [buckets, setBuckets] = useState<BucketRow[]>([])

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
      setBuckets(Array.isArray(data.buckets) ? data.buckets : [])
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

  const maxCount = useMemo(
    () => Math.max(...buckets.map((b) => b.lead_count), 1),
    [buckets]
  )

  if (loading) {
    return <div className="text-sm text-gray-500 py-8 text-center">Loading bucket analytics…</div>
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Lead bucket analytics</h2>
          <p className="text-sm text-gray-600 mt-1">
            How many leads sit in each bucket. Tags do not change lead status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchReport()}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
          >
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <Layers className="w-4 h-4 text-[#dd3f3c]" />
              Buckets
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_buckets}</p>
            <p className="text-[11px] text-gray-400">{summary.active_buckets} active</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <Users className="w-4 h-4 text-[#dd3f3c]" />
              Tagged leads
            </div>
            <p className="text-2xl font-bold text-[#dd3f3c] mt-1">{summary.unique_leads_tagged}</p>
            <p className="text-[11px] text-gray-400">unique leads</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              Untagged
            </div>
            <p className="text-2xl font-bold text-gray-700 mt-1">{summary.untagged_leads}</p>
            <p className="text-[11px] text-gray-400">of {summary.total_leads_in_system} total</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              Assignments
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_assignments}</p>
            <p className="text-[11px] text-gray-400">incl. multi-bucket</p>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Leads per bucket</h3>
        </div>
        {buckets.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No buckets created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <th className="px-4 py-3">Bucket</th>
                  <th className="px-4 py-3 text-center w-24">Leads</th>
                  <th className="px-4 py-3 min-w-[200px]">Distribution</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {buckets.map((bucket) => {
                  const pct = summary?.unique_leads_tagged
                    ? Math.round((bucket.lead_count / summary.unique_leads_tagged) * 1000) / 10
                    : 0
                  const barColor = bucket.color || '#dd3f3c'
                  return (
                    <tr key={bucket.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: barColor }}
                          />
                          <div>
                            <p className="font-medium text-gray-900">{bucket.name}</p>
                            {!bucket.is_active && (
                              <span className="text-[10px] uppercase text-gray-400">Inactive</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-[#dd3f3c]">
                        {bucket.lead_count}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(bucket.lead_count / maxCount) * 100}%`,
                                backgroundColor: barColor,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-12 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href="/buckets"
                          className="inline-flex text-[#dd3f3c] hover:text-[#c93532]"
                          aria-label={`View ${bucket.name}`}
                        >
                          <ChevronRight className="w-5 h-5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
