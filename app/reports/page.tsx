'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuthContext } from '@/components/AuthProvider'
import { cachedFetch } from '@/lib/api-client'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { Phone, User, Calendar, BarChart3, ChevronRight, PhoneMissed, Layers } from 'lucide-react'
import BucketAnalyticsReport from '@/components/reports/BucketAnalyticsReport'

type ReportTab = 'calls' | 'buckets'

function todayLocalYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MAX_REPORT_RANGE_DAYS = 30

/** Interpret `YYYY-MM-DD` as the user's local calendar day → UTC ISO bounds for the API. */
function localDayBoundsIso(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) {
    return localDayBoundsIso(todayLocalYmd())
  }
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const end = new Date(y, m - 1, d, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Inclusive local from/to dates → API `start` (start of from day) and `end` (end of to day). */
function localDateRangeBoundsIso(fromStr: string, toStr: string): { start: string; end: string } {
  const from = localDayBoundsIso(fromStr)
  const to = localDayBoundsIso(toStr)
  return { start: from.start, end: to.end }
}

function reportRangeError(fromStr: string, toStr: string): string | null {
  const { start, end } = localDateRangeBoundsIso(fromStr, toStr)
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (endMs < startMs) return 'To date must be on or after from date'
  const spanMs = endMs - startMs
  if (spanMs > MAX_REPORT_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    return `Date range cannot exceed ${MAX_REPORT_RANGE_DAYS} days`
  }
  return null
}

function formatOutcome(outcome: string): string {
  return outcome.replace(/_/g, ' ')
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

interface CallRow {
  id: string
  lead_id: string
  called_by: string
  outcome: string
  disposition: string | null
  notes: string | null
  call_duration: number | null
  created_at: string
  recording_url: string | null
  started_at: string | null
  ended_at: string | null
  answered_duration_seconds: number | null
  dial_status: string | null
  direction: string | null
  integration: string
  mcube_agent_name: string | null
  called_by_user: { id: string; name: string } | null
  lead: { id: string; name: string; phone: string } | null
}

interface SummaryByUser {
  userId: string
  name: string
  count: number
  connected: number
  notReachable: number
}

export default function ReportsPage() {
  const router = useRouter()
  const { isAuthenticated, loading: authLoading, role } = useAuthContext()
  const [fromDate, setFromDate] = useState(todayLocalYmd)
  const [toDate, setToDate] = useState(todayLocalYmd)
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [calls, setCalls] = useState<CallRow[]>([])
  const [summary, setSummary] = useState<{
    totalLeads: number
    connected: number
    notReachable: number
    byUser: SummaryByUser[]
  } | null>(null)
  const [outcomeFilter, setOutcomeFilter] = useState<'connected' | 'not_reachable'>('connected')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportTab, setReportTab] = useState<ReportTab>('calls')

  const canAccessCallsReport = useMemo(() => {
    const rn = role?.name?.toLowerCase() ?? ''
    if (rn === SYSTEM_ROLES.SUPER_ADMIN || rn === SYSTEM_ROLES.ADMIN) return true
    const perms = role?.permissions ?? []
    return perms.includes(PERMISSIONS.REPORTS_READ) || perms.includes(PERMISSIONS.REPORTS_MANAGE)
  }, [role])

  const canAccessBucketReport = useMemo(() => {
    const rn = role?.name?.toLowerCase() ?? ''
    if (rn === SYSTEM_ROLES.SUPER_ADMIN || rn === SYSTEM_ROLES.ADMIN) return true
    const perms = role?.permissions ?? []
    return (
      perms.includes(PERMISSIONS.REPORTS_READ) ||
      perms.includes(PERMISSIONS.REPORTS_MANAGE) ||
      perms.includes(PERMISSIONS.BUCKETS_READ) ||
      perms.includes(PERMISSIONS.BUCKETS_MANAGE)
    )
  }, [role])

  const canAccessReports = canAccessCallsReport || canAccessBucketReport

  const canViewAllCallers = useMemo(() => {
    const rn = role?.name?.toLowerCase() ?? ''
    return (
      rn === SYSTEM_ROLES.SUPER_ADMIN ||
      rn === SYSTEM_ROLES.ADMIN ||
      rn === SYSTEM_ROLES.MARKETING
    )
  }, [role])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    if (!canAccessReports) {
      router.push('/dashboard')
      return
    }
    if (!canAccessCallsReport && canAccessBucketReport) {
      setReportTab('buckets')
    }
  }, [authLoading, isAuthenticated, canAccessReports, canAccessCallsReport, canAccessBucketReport, router])

  useEffect(() => {
    if (!isAuthenticated || !canViewAllCallers) return
    ;(async () => {
      const res = await cachedFetch('/api/users', undefined, 0)
      if (!res.ok) return
      const data = await res.json()
      const list: { id: string; name: string }[] = (data.users || []).map((u: { id: string; name: string }) => ({
        id: u.id,
        name: u.name,
      }))
      list.sort((a, b) => a.name.localeCompare(b.name))
      setAgents(list)
    })()
  }, [isAuthenticated, canViewAllCallers])

  const fetchReport = useCallback(async () => {
    if (!canAccessCallsReport) return
    const rangeErr = reportRangeError(fromDate, toDate)
    if (rangeErr) {
      setError(rangeErr)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { start, end } = localDateRangeBoundsIso(fromDate, toDate)
      const sp = new URLSearchParams({ start, end })
      if (canViewAllCallers && agentFilter) {
        sp.set('user_id', agentFilter)
      }
      const res = await cachedFetch(`/api/reports/daily-calls?${sp.toString()}`, undefined, 0)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to load report')
        setCalls([])
        setSummary(null)
        return
      }
      setCalls(data.calls || [])
      setSummary(data.summary || null)
    } catch {
      setError('Failed to load report')
      setCalls([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, agentFilter, canAccessCallsReport, canViewAllCallers])

  const showDateInTimeColumn = fromDate !== toDate

  useEffect(() => {
    if (!authLoading && isAuthenticated && canAccessCallsReport && reportTab === 'calls') {
      void fetchReport()
    }
  }, [authLoading, isAuthenticated, canAccessCallsReport, reportTab, fetchReport])

  if (authLoading || !isAuthenticated || !canAccessReports) {
    return (
      <Layout mobileTitle="Reports">
        <div className="p-6 flex items-center justify-center min-h-[40vh] text-gray-500">Loading…</div>
      </Layout>
    )
  }

  return (
    <Layout mobileTitle="Reports">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Call activity and lead bucket analytics.
          </p>
        </div>

        {canAccessCallsReport && canAccessBucketReport ? (
          <div className="flex gap-1 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setReportTab('calls')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                reportTab === 'calls'
                  ? 'border-[#dd3f3c] text-[#dd3f3c]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-4 h-4" />
                Call reports
              </span>
            </button>
            <button
              type="button"
              onClick={() => setReportTab('buckets')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                reportTab === 'buckets'
                  ? 'border-[#dd3f3c] text-[#dd3f3c]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                Bucket analytics
              </span>
            </button>
          </div>
        ) : null}

        {reportTab === 'buckets' && canAccessBucketReport ? (
          <BucketAnalyticsReport />
        ) : canAccessCallsReport ? (
        <>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Call reports</h2>
          <p className="text-gray-600 mt-1 text-sm">
            MCUBE-dialed calls only: activity, leads contacted, and recordings when available from MCUBE or sync.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                From date
              </label>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => {
                  const next = e.target.value
                  setFromDate(next)
                  if (next && toDate && next > toDate) setToDate(next)
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                To date
              </label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => {
                  const next = e.target.value
                  setToDate(next)
                  if (next && fromDate && next < fromDate) setFromDate(next)
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 sm:self-center sm:pb-2">
            Up to {MAX_REPORT_RANGE_DAYS} days per report
          </p>
          {canViewAllCallers ? (
            <div className="flex flex-col gap-1 min-w-[200px] flex-1 sm:max-w-xs">
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                Agent
              </label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
              >
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {agents.length === 0 ? (
                <span className="text-[11px] text-amber-700">
                  User list requires <code className="text-[10px]">users.read</code>. You still see all-call data.
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500 self-center">Showing your calls only</p>
          )}
          <button
            type="button"
            onClick={() => void fetchReport()}
            disabled={loading}
            className="sm:ml-auto px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
        ) : null}

        {summary ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
                <Phone className="w-4 h-4" />
                Leads Called
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalLeads}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
                <BarChart3 className="w-4 h-4" />
                Connected
              </div>
              <p className="text-2xl font-bold text-green-700 mt-1">{summary.connected}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">≥ 5s duration</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
                <PhoneMissed className="w-4 h-4" />
                Not Reachable
              </div>
              <p className="text-2xl font-bold text-red-600 mt-1">{summary.notReachable}</p>
            </div>
          </div>
        ) : null}

        {canViewAllCallers && summary && summary.byUser.length > 0 && !agentFilter ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Leads by caller</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    <th className="px-4 py-3">Caller</th>
                    <th className="px-4 py-3 text-center">Leads Called</th>
                    <th className="px-4 py-3 text-center">Connected</th>
                    <th className="px-4 py-3 text-center">Not Reachable</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.byUser.map((row) => (
                    <tr key={row.userId} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{row.count}</td>
                      <td className="px-4 py-3 text-center font-medium text-green-700">{row.connected}</td>
                      <td className="px-4 py-3 text-center font-medium text-red-600">{row.notReachable}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setAgentFilter(row.userId)}
                          className="text-xs text-[#2563eb] hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Lead log</h2>
            <div className="flex items-center gap-1">
              {(['connected', 'not_reachable'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOutcomeFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    outcomeFilter === f
                      ? f === 'connected'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {f === 'connected' ? 'Connected' : 'Not Reachable'}
                </button>
              ))}
              {calls.length >= 2500 ? (
                <span className="text-xs text-amber-700 ml-2">Showing first 2,500 rows</span>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading && calls.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
            ) : (() => {
              const visibleCalls = outcomeFilter === 'connected'
                ? calls.filter((c) => c.outcome === 'connected' && ((c.answered_duration_seconds ?? c.call_duration ?? 0) >= 5))
                : calls.filter((c) => c.outcome === outcomeFilter)
              if (visibleCalls.length === 0) {
                return <div className="p-8 text-center text-gray-500 text-sm">No leads for this filter.</div>
              }
              return (
              <table className="min-w-[880px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Recording</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleCalls.map((call) => {
                    const when = new Date(call.created_at)
                    const timeStr = showDateInTimeColumn
                      ? when.toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : when.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                    const dur =
                      call.answered_duration_seconds ?? call.call_duration ?? null
                    const rec = call.recording_url?.trim()
                    return (
                      <tr key={call.id} className="hover:bg-gray-50/80 align-top">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{timeStr}</td>
                        <td className="px-4 py-3 text-gray-900">
                          {call.called_by_user?.name ?? '—'}
                          {call.integration === 'mcube' && call.mcube_agent_name ? (
                            <span className="block text-xs text-gray-500">{call.mcube_agent_name}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {call.lead ? (
                            <div>
                              <span className="text-gray-900 font-medium">{call.lead.name}</span>
                              <span className="block text-xs text-gray-500">{call.lead.phone}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 capitalize">{formatOutcome(call.outcome)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDuration(dur)}</td>
                        <td className="px-4 py-3 min-w-[200px] max-w-[320px]">
                          {rec ? (
                            <div className="space-y-1">
                              <audio controls preload="metadata" className="w-full h-9">
                                <source src={rec} />
                              </audio>
                              <a
                                href={rec}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#2563eb] underline"
                              >
                                Open recording
                              </a>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {call.lead?.id ? (
                            <Link
                              href={`/leads/${call.lead.id}`}
                              className="inline-flex text-[#2563eb] hover:text-[#1d4ed8]"
                              aria-label="Open lead"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              )
            })()}
          </div>
        </div>
        </>
        ) : (
          <BucketAnalyticsReport />
        )}
      </div>
    </Layout>
  )
}
