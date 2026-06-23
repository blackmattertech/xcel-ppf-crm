'use client'

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Users,
  Send,
  CheckCircle2,
  XCircle,
  Layers,
  RefreshCw,
  BarChart3,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cachedFetch } from '@/lib/api-client'
import type { AutomationFlow } from '@/shared/whatsapp-automation-types'
import { istDateToUtcStart, todayIstDateString, toIstDateString } from '@/shared/whatsapp-automation-ist'

const WA_TEAL = '#128C7E'

function defaultIstStartDate(): string {
  const end = todayIstDateString()
  const startMs = istDateToUtcStart(end).getTime() - 30 * 24 * 60 * 60 * 1000
  return toIstDateString(new Date(startMs))
}

interface AnalyticsData {
  flow: {
    id: string
    name: string
    cycle_days: number
    is_active: boolean
    restart_on_complete: boolean
  }
  period: { startDate: string; endDate: string; timezone: 'Asia/Kolkata' }
  enrollments: {
    active: number
    completed: number
    cancelled: number
    total: number
    inPeriod: number
    direct: number
    bucket: number
  }
  sends: {
    sent: number
    failed: number
    retrying: number
    total: number
    successRate: number
  }
  byTriggerDay: Array<{
    trigger_id: string
    day_offset: number
    message_type: string
    sent: number
    failed: number
    retrying: number
    total: number
  }>
  batches: {
    pending: number
    processing: number
    completed: number
    failed: number
    total: number
  }
  sendsOverTime: Array<{ date: string; sent: number; failed: number; total: number }>
  enrollmentsOverTime: Array<{ date: string; count: number }>
  recentFailures: Array<{
    id: string
    lead_name: string | null
    phone: string
    day_offset: number | null
    message_type: string | null
    error: string | null
    sent_at: string
  }>
  bucketLinks: { active: number; total: number }
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: ComponentType<{ className?: string }>
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent || WA_TEAL}18`, color: accent || WA_TEAL }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export default function AutomationAnalyticsPage() {
  const [flows, setFlows] = useState<AutomationFlow[]>([])
  const [flowId, setFlowId] = useState('')
  const [startDate, setStartDate] = useState(defaultIstStartDate)
  const [endDate, setEndDate] = useState(todayIstDateString)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadFlows = useCallback(async () => {
    const res = await cachedFetch('/api/automation/whatsapp/flows')
    const json = await res.json()
    if (res.ok) {
      const list = json.flows || []
      setFlows(list)
      if (!flowId && list.length > 0) setFlowId(list[0].id)
    }
  }, [flowId])

  const loadAnalytics = useCallback(async () => {
    if (!flowId) return
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ flowId, startDate, endDate })
      const res = await cachedFetch(`/api/automation/whatsapp/analytics?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load analytics')
      setData(json as AnalyticsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [flowId, startDate, endDate])

  useEffect(() => {
    void loadFlows()
  }, [loadFlows])

  useEffect(() => {
    if (flowId) void loadAnalytics()
  }, [flowId, loadAnalytics])

  const chartSends = useMemo(() => data?.sendsOverTime ?? [], [data])
  const chartEnroll = useMemo(() => data?.enrollmentsOverTime ?? [], [data])

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/marketing/whatsapp/automation"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Automation flows
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-[#128C7E]" />
            Flow analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            IST calendar dates · sends and charts use selected range · active enrollments are current totals
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAnalytics()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500 mb-1">Flow</span>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 min-w-[200px]"
            value={flowId}
            onChange={(e) => setFlowId(e.target.value)}
          >
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} {f.is_active ? '' : '(inactive)'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500 mb-1">From</span>
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500 mb-1">To</span>
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active enrollments"
              value={data.enrollments.active}
              sub={`${data.enrollments.inPeriod} new in period · ${data.enrollments.total} all-time`}
              icon={Users}
            />
            <StatCard
              label="Messages sent"
              value={data.sends.sent}
              sub={`${data.sends.successRate}% success · ${data.period.startDate}–${data.period.endDate} IST`}
              icon={Send}
              accent="#25D366"
            />
            <StatCard
              label="Failed sends"
              value={data.sends.failed}
              sub={data.sends.retrying > 0 ? `${data.sends.retrying} retrying` : undefined}
              icon={XCircle}
              accent="#dc2626"
            />
            <StatCard
              label="Bucket links"
              value={data.bucketLinks.active}
              sub={`${data.batches.completed}/${data.batches.total} batches done`}
              icon={Layers}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Sends over time</h2>
              {chartSends.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No sends in this period</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartSends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sent" fill="#25D366" name="Sent" stackId="a" />
                    <Bar dataKey="failed" fill="#f87171" name="Failed" stackId="a" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">New enrollments</h2>
              {chartEnroll.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No enrollments in this period</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartEnroll}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke={WA_TEAL} strokeWidth={2} name="Enrollments" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Performance by trigger day</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {data.flow.name} · {data.flow.cycle_days}-day cycle
                {data.flow.restart_on_complete ? ' · restarts on complete' : ''}
              </p>
            </div>
            {data.byTriggerDay.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No triggers configured on this flow.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <th className="px-4 py-2">Day</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Sent</th>
                      <th className="px-4 py-2">Failed</th>
                      <th className="px-4 py-2">Retrying</th>
                      <th className="px-4 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.byTriggerDay.map((row) => (
                      <tr key={row.trigger_id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-medium">Day {row.day_offset}</td>
                        <td className="px-4 py-2 capitalize text-slate-600">{row.message_type}</td>
                        <td className="px-4 py-2 text-emerald-700">{row.sent}</td>
                        <td className="px-4 py-2 text-red-600">{row.failed}</td>
                        <td className="px-4 py-2 text-amber-600">{row.retrying}</td>
                        <td className="px-4 py-2">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-1" />
              <p className="text-2xl font-bold">{data.enrollments.completed}</p>
              <p className="text-xs text-slate-500">Completed enrollments</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <Users className="h-6 w-6 text-sky-600 mx-auto mb-1" />
              <p className="text-2xl font-bold">{data.enrollments.active}</p>
              <p className="text-xs text-slate-500">Still in flow</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <XCircle className="h-6 w-6 text-slate-400 mx-auto mb-1" />
              <p className="text-2xl font-bold">{data.enrollments.cancelled}</p>
              <p className="text-xs text-slate-500">Cancelled</p>
            </div>
          </div>

          {data.recentFailures.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-white overflow-hidden">
              <div className="border-b border-red-50 px-4 py-3 bg-red-50/50">
                <h2 className="text-sm font-semibold text-red-900">Recent failures</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {data.recentFailures.map((f) => (
                  <div key={f.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        {f.lead_name || f.phone}
                        {f.day_offset != null && (
                          <span className="text-slate-400 font-normal"> · Day {f.day_offset}</span>
                        )}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(f.sent_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-red-700 mt-1 line-clamp-2">{f.error || 'Send failed'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
