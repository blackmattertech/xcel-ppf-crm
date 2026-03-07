'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2, FileEdit, CheckCircle, Clock, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import type { TemplateForOverview } from '../_lib/types'

const PIE_COLORS = [
  '#25D366', '#128C7E', '#34B7F1', '#6366f1', '#8b5cf6',
  '#ec4899', '#f59e0b', '#22c55e', '#64748b',
]
const BAR_COLORS = ['#25D366', '#128C7E', '#34B7F1', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b']

interface WhatsAppAnalytics {
  messagesByDirection: Record<string, number>
  messagesByStatus: Record<string, number>
  messagesOverTime: Array<{ date: string; sent: number; received: number; total: number }>
  messagesByTemplate: Array<{ template: string; count: number }>
  totals: { sent: number; received: number; total: number }
  period: { startDate: string; endDate: string }
}

const PERIOD_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const

export default function OverviewPage() {
  const [loading, setLoading] = useState(true)
  const [apiConfigured, setApiConfigured] = useState(false)
  const [templates, setTemplates] = useState<TemplateForOverview[]>([])
  const [analytics, setAnalytics] = useState<WhatsAppAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [periodDays, setPeriodDays] = useState<number>(30)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - periodDays)
    const startDate = start.toISOString()
    const endDate = end.toISOString()

    Promise.all([
      fetch('/api/marketing/whatsapp/config').then((r) => (r.ok ? r.json() : { configured: false })),
      fetch('/api/marketing/whatsapp/templates').then((r) => {
        if (!r.ok) throw new Error('Failed to load templates')
        return r.json()
      }),
      fetch(`/api/marketing/whatsapp/analytics?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([config, data, analyticsData]) => {
        setApiConfigured(!!config?.configured)
        setTemplates(data?.templates ?? [])
        setAnalytics(analyticsData ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [periodDays])

  const stats = useMemo(() => {
    const total = templates.length
    const approved = templates.filter((t) => t.status === 'approved').length
    const pending = templates.filter((t) => t.status === 'pending').length
    const rejected = templates.filter((t) => t.status === 'rejected').length
    const draft = templates.filter((t) => t.status === 'draft').length
    return { total, approved, pending, rejected, draft }
  }, [templates])

  const directionPieData = useMemo(() => {
    if (!analytics?.messagesByDirection) return []
    return [
      { name: 'Outgoing', value: analytics.messagesByDirection.out ?? 0 },
      { name: 'Incoming', value: analytics.messagesByDirection.in ?? 0 },
    ].filter((d) => d.value > 0)
  }, [analytics])

  const statusPieData = useMemo(() => {
    if (!analytics?.messagesByStatus) return []
    const labels: Record<string, string> = {
      sent: 'Sent',
      delivered: 'Delivered',
      read: 'Read',
      pending: 'Pending',
    }
    return Object.entries(analytics.messagesByStatus).map(([k, v]) => ({
      name: labels[k] ?? k,
      value: v,
    })).filter((d) => d.value > 0)
  }, [analytics])

  const messagesOverTimeChart = useMemo(() => {
    if (!analytics?.messagesOverTime?.length) return []
    return analytics.messagesOverTime.map((d) => ({
      ...d,
      shortDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }))
  }, [analytics])

  const templateBarData = useMemo(() => {
    if (!analytics?.messagesByTemplate?.length) return []
    return analytics.messagesByTemplate.map((d) => ({
      name: d.template.length > 12 ? d.template.slice(0, 10) + '…' : d.template,
      fullName: d.template,
      count: d.count,
    }))
  }, [analytics])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#ed1b24]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Template stats */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-medium text-gray-900">Template stats</div>
        <div className="p-4">
          {error && (
            <p className="text-sm text-amber-600 mb-4">{error}</p>
          )}
          {!apiConfigured && (
            <p className="text-sm text-amber-600 mb-4">
              WhatsApp API is not configured. Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to use templates and bulk send.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex items-center gap-2 text-gray-600 text-sm font-medium mb-1">
                <FileEdit className="h-4 w-4" />
                Templates created
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total in app</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
              <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-1">
                <CheckCircle className="h-4 w-4" />
                Approved
              </div>
              <p className="text-2xl font-bold text-green-800">{stats.approved}</p>
              <p className="text-xs text-gray-500 mt-0.5">Ready for broadcast</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                <Clock className="h-4 w-4" />
                Pending
              </div>
              <p className="text-2xl font-bold text-amber-800">{stats.pending}</p>
              <p className="text-xs text-gray-500 mt-0.5">Under Meta review</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1">
                <XCircle className="h-4 w-4" />
                Rejected
              </div>
              <p className="text-2xl font-bold text-red-800">{stats.rejected}</p>
              <p className="text-xs text-gray-500 mt-0.5">Not approved by Meta</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex items-center gap-2 text-gray-600 text-sm font-medium mb-1">
                <FileEdit className="h-4 w-4" />
                Draft
              </div>
              <p className="text-2xl font-bold text-gray-800">{stats.draft}</p>
              <p className="text-xs text-gray-500 mt-0.5">Not submitted yet</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            This app uses the <strong>WhatsApp Cloud API</strong>. Meta also offers the{' '}
            <a href="https://developers.facebook.com/docs/whatsapp/marketing-messages-api-for-whatsapp/" target="_blank" rel="noopener noreferrer" className="text-[#ed1b24] hover:underline">Marketing Messages API for WhatsApp</a>
            {' '}with extra features: GIF headers, TTL 12h–30d for marketing, benchmarks, recommendations, conversion metrics. Same message payload; onboard via App Dashboard → WhatsApp → Quickstart if you need those features.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Throughput: default up to 80 messages/sec (up to 1,000 when upgraded). If you see error 130429, you&apos;re over the limit — wait and retry.{' '}
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/throughput" target="_blank" rel="noopener noreferrer" className="text-[#ed1b24] hover:underline">Throughput</a>
          </p>
        </div>
      </section>

      {/* Campaign-wise metrics (template-based sends) */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-gray-900">Campaign-wise metrics</span>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setPeriodDays(opt.days)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  periodDays === opt.days
                    ? 'bg-[#ed1b24] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 space-y-6">
          <p className="text-xs text-gray-500 -mt-2">
            Metrics below are for template-based broadcasts and conversations in the selected period.
          </p>
          {/* Summary cards */}
          {analytics && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                <p className="text-sm font-medium text-gray-600">Total messages</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totals.total}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
                <p className="text-sm font-medium text-green-700">Sent (outgoing)</p>
                <p className="text-2xl font-bold text-green-800">{analytics.totals.sent}</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                <p className="text-sm font-medium text-blue-700">Received (incoming)</p>
                <p className="text-2xl font-bold text-blue-800">{analytics.totals.received}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie: Message direction */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm"
            >
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Messages by direction</h3>
              {directionPieData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">No message data in this period</div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={directionPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        animationBegin={200}
                        animationDuration={800}
                      >
                        {directionPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v ?? 0, 'Messages']} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>

            {/* Pie: Delivery status (outgoing) */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm"
            >
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Outgoing delivery status</h3>
              {statusPieData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">No outgoing messages in this period</div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        animationBegin={200}
                        animationDuration={800}
                      >
                        {statusPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v ?? 0, 'Messages']} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          </div>

          {/* Bar: Messages over time */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm"
          >
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Messages over time</h3>
            {messagesOverTimeChart.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">No time-series data</div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={messagesOverTimeChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#25D366" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#25D366" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="receivedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34B7F1" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#34B7F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortDate"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date}
                      formatter={(value, name) => [value ?? 0, name === 'sent' ? 'Sent' : 'Received']}
                    />
                    <Legend formatter={(v) => (v === 'sent' ? 'Sent' : 'Received')} />
                    <Area type="monotone" dataKey="sent" stroke="#25D366" fill="url(#sentGrad)" strokeWidth={2} name="sent" />
                    <Area type="monotone" dataKey="received" stroke="#34B7F1" fill="url(#receivedGrad)" strokeWidth={2} name="received" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>

          {/* Bar: Messages by template */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm"
          >
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Messages by template (campaign-wise)</h3>
            {templateBarData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">No template messages in this period</div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={templateBarData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#475569' }}
                      axisLine={false}
                      tickLine={false}
                      angle={templateBarData.length > 4 ? -25 : 0}
                      textAnchor={templateBarData.length > 4 ? 'end' : 'middle'}
                    />
                    <YAxis
                      type="number"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value) => [value ?? 0, 'Messages']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48} name="Messages" animationBegin={300} animationDuration={700}>
                      {templateBarData.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>
        </div>
      </section>
    </div>
  )
}
