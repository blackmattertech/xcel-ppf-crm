'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuthContext } from '@/components/AuthProvider'
import { cachedFetch } from '@/lib/api-client'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { Phone, User, Calendar, BarChart3, ChevronRight } from 'lucide-react'

function todayLocalYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
}

export default function ReportsPage() {
  const router = useRouter()
  const { isAuthenticated, loading: authLoading, role } = useAuthContext()
  const [selectedDate, setSelectedDate] = useState(todayLocalYmd)
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [calls, setCalls] = useState<CallRow[]>([])
  const [summary, setSummary] = useState<{
    totalCalls: number
    connected: number
    byUser: SummaryByUser[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canAccessReports = useMemo(() => {
    const rn = role?.name?.toLowerCase() ?? ''
    if (rn === SYSTEM_ROLES.SUPER_ADMIN || rn === SYSTEM_ROLES.ADMIN) return true
    const perms = role?.permissions ?? []
    return perms.includes(PERMISSIONS.REPORTS_READ) || perms.includes(PERMISSIONS.REPORTS_MANAGE)
  }, [role])

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
    }
  }, [authLoading, isAuthenticated, canAccessReports, router])

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
    if (!canAccessReports) return
    setLoading(true)
    setError(null)
    try {
      const { start, end } = localDayBoundsIso(selectedDate)
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
  }, [selectedDate, agentFilter, canAccessReports, canViewAllCallers])

  useEffect(() => {
    if (!authLoading && isAuthenticated && canAccessReports) {
      void fetchReport()
    }
  }, [authLoading, isAuthenticated, canAccessReports, fetchReport])

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
          <h1 className="text-2xl font-bold text-gray-900">Call reports</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            MCUBE-dialed calls only: activity, leads contacted, and recordings when available from MCUBE or sync.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
            />
          </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
                <Phone className="w-4 h-4" />
                Total calls
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalCalls}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
                <BarChart3 className="w-4 h-4" />
                Connected
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.connected}</p>
            </div>
          </div>
        ) : null}

        {canViewAllCallers && summary && summary.byUser.length > 1 && !agentFilter ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Calls by agent</h2>
            <div className="flex flex-wrap gap-2">
              {summary.byUser.map((row) => (
                <button
                  key={row.userId}
                  type="button"
                  onClick={() => setAgentFilter(row.userId)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-sm text-gray-800 hover:bg-gray-100"
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="text-gray-500">{row.count}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Call log</h2>
            {calls.length >= 2500 ? (
              <span className="text-xs text-amber-700">Showing first 2,500 rows for this range</span>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            {loading && calls.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading calls…</div>
            ) : calls.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No calls for this day.</div>
            ) : (
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
                  {calls.map((call) => {
                    const when = new Date(call.created_at)
                    const timeStr = when.toLocaleTimeString(undefined, {
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
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
