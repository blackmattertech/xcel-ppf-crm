'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Loader2, FileEdit, CheckCircle, Clock, XCircle, BarChart2, MapPin, Package, TrendingUp, DollarSign, Eye, Users, MousePointer, Target, Percent, Zap } from 'lucide-react'
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
  Line,
  ComposedChart,
} from 'recharts'
import type { TemplateForOverview } from '../_lib/types'

const PIE_COLORS = [
  '#25D366', '#128C7E', '#34B7F1', '#6366f1', '#8b5cf6',
  '#ec4899', '#f59e0b', '#22c55e', '#64748b',
]
const BAR_COLORS = ['#25D366', '#128C7E', '#34B7F1', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b']
const META_PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  messenger: '#0084FF',
  audience_network: '#FF6B35',
  unknown: '#64748b',
}

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

const META_DATE_OPTIONS = [
  { label: '7d', value: 'last_7d' },
  { label: '30d', value: 'last_30d' },
  { label: '90d', value: 'last_90d' },
] as const

interface MetaCampaignRow {
  id: string
  name: string
  status: string
  impressions: number
  reach: number
  leads: number
  crmLeads: number
  formsFilled: number
  spend: string
}

interface MetaAdsOverview {
  connected: boolean
  error?: string
  campaigns: MetaCampaignRow[]
  leadAnalytics: {
    totalLeads: number
    byProduct: Array<{ name: string; count: number }>
    byLocation: Array<{ location: string; count: number }>
    byCity: Array<{ city: string; count: number }>
    byState: Array<{ state: string; count: number }>
    byRegion?: Array<{ region: string; impressions: number; reach: number }>
  }
  accountSummary?: {
    spend: number
    impressions: number
    reach: number
    clicks: number
    leads: number
    cpm: number
    ctr: number
    cpl: number
  }
  insightsOverTime?: Array<{ date: string; impressions: number; reach: number; spend: number; clicks: number; leads: number }>
  byPlatform?: Array<{ platform: string; impressions: number; reach: number; spend: number; clicks: number }>
  dateRange?: string
}

export default function MarketingDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [apiConfigured, setApiConfigured] = useState(false)
  const [templates, setTemplates] = useState<TemplateForOverview[]>([])
  const [analytics, setAnalytics] = useState<WhatsAppAnalytics | null>(null)
  const [metaAdsOverview, setMetaAdsOverview] = useState<MetaAdsOverview | null>(null)
  const [metaDateRange, setMetaDateRange] = useState<string>('last_30d')
  const [error, setError] = useState<string | null>(null)
  const [periodDays, setPeriodDays] = useState<number>(30)
  const lastEtagRef = useRef<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - periodDays)
    const startDate = start.toISOString()
    const endDate = end.toISOString()

    const url = `/api/marketing/overview?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&date_range=${encodeURIComponent(metaDateRange)}`
    const headers: HeadersInit = {}
    const etag = lastEtagRef.current
    if (etag) headers['If-None-Match'] = etag

    fetch(url, { credentials: 'include', headers })
      .then((res) => {
        const newEtag = res.headers.get('ETag')
        if (newEtag) lastEtagRef.current = newEtag
        if (res.status === 304) return null
        if (!res.ok) throw new Error('Failed to load overview')
        return res.json()
      })
      .then((data) => {
        if (data) {
          setApiConfigured(!!data.config?.configured)
          setTemplates(data.templates ?? [])
          setAnalytics(data.analytics ?? null)
          setMetaAdsOverview(data.metaAdsOverview ?? null)
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [periodDays, metaDateRange])

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

      {/* Meta Ads Manager Dashboard */}
      <section className="rounded-2xl overflow-hidden shadow-lg border border-gray-200/80 bg-gradient-to-b from-slate-50 to-white">
        <div className="bg-gradient-to-r from-[#1877F2] via-[#0d65d9] to-[#0a4a9e] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <BarChart2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Meta Ads Manager</h2>
              <p className="text-sm text-white/80">Campaign performance, insights & lead analytics</p>
            </div>
          </div>
          <div className="flex gap-2">
            {META_DATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMetaDateRange(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  metaDateRange === opt.value
                    ? 'bg-white text-[#1877F2] shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-8">
          {!metaAdsOverview?.connected ? (
            <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/80 p-8 text-center">
              <p className="text-base font-medium text-amber-900">
                {metaAdsOverview?.error || 'Connect your Facebook Business account in Settings → Integrations'}
              </p>
              <p className="mt-2 text-sm text-amber-700">
                All data is fetched directly from Meta: spend, impressions, reach, leads, CPM, CTR, platform breakdown, and more.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {[
                  { label: 'Spend', value: metaAdsOverview.accountSummary?.spend ?? 0, format: (v: number) => `₹${v.toFixed(2)}`, icon: DollarSign, color: 'from-rose-500 to-rose-600' },
                  { label: 'Impressions', value: metaAdsOverview.accountSummary?.impressions ?? 0, format: (v: number) => v.toLocaleString(), icon: Eye, color: 'from-blue-500 to-blue-600' },
                  { label: 'Reach', value: metaAdsOverview.accountSummary?.reach ?? 0, format: (v: number) => v.toLocaleString(), icon: Users, color: 'from-violet-500 to-violet-600' },
                  { label: 'Clicks', value: metaAdsOverview.accountSummary?.clicks ?? 0, format: (v: number) => v.toLocaleString(), icon: MousePointer, color: 'from-cyan-500 to-cyan-600' },
                  { label: 'Leads', value: metaAdsOverview.accountSummary?.leads ?? 0, format: (v: number) => v.toLocaleString(), icon: Target, color: 'from-emerald-500 to-emerald-600' },
                  { label: 'CPM', value: metaAdsOverview.accountSummary?.cpm ?? 0, format: (v: number) => `₹${v.toFixed(2)}`, icon: Zap, color: 'from-amber-500 to-amber-600' },
                  { label: 'CTR', value: metaAdsOverview.accountSummary?.ctr ?? 0, format: (v: number) => `${v.toFixed(2)}%`, icon: Percent, color: 'from-indigo-500 to-indigo-600' },
                  { label: 'CPL', value: metaAdsOverview.accountSummary?.cpl ?? 0, format: (v: number) => v > 0 ? `₹${v.toFixed(2)}` : '—', icon: DollarSign, color: 'from-teal-500 to-teal-600' },
                ].map((kpi, i) => (
                  <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-xl bg-white border border-gray-200/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <div className={`h-1 bg-gradient-to-r ${kpi.color}`} />
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">
                        <kpi.icon className="h-3.5 w-3.5" />
                        {kpi.label}
                      </div>
                      <p className="text-xl font-bold text-gray-900">{kpi.format(kpi.value)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {metaAdsOverview.insightsOverTime && metaAdsOverview.insightsOverTime.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white border border-gray-200/80 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[#1877F2]" />
                    Performance over time
                  </h3>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={metaAdsOverview.insightsOverTime.map((d) => ({ ...d, shortDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="impGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1877F2" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#1877F2" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ec4899" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                          formatter={(value, name) => { const n = String(name ?? ''); return [name === 'spend' ? `₹${Number(value ?? 0).toFixed(2)}` : Number(value ?? 0).toLocaleString(), n.charAt(0).toUpperCase() + n.slice(1)]; }}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.date}
                        />
                        <Legend />
                        <Area yAxisId="left" type="monotone" dataKey="impressions" stroke="#1877F2" fill="url(#impGrad)" strokeWidth={2} name="Impressions" />
                        <Area yAxisId="right" type="monotone" dataKey="spend" stroke="#ec4899" fill="url(#spendGrad)" strokeWidth={2} name="Spend" />
                        <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="#22c55e" strokeWidth={2} dot={false} name="Clicks" />
                        <Line yAxisId="left" type="monotone" dataKey="leads" stroke="#f59e0b" strokeWidth={2} dot={false} name="Leads" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {metaAdsOverview.byPlatform && metaAdsOverview.byPlatform.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white border border-gray-200/80 p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 mb-4">Performance by platform</h3>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metaAdsOverview.byPlatform} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                          <YAxis type="category" dataKey="platform" width={90} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [(v ?? 0).toLocaleString(), '']} />
                          <Bar dataKey="impressions" radius={[0, 4, 4, 0]} name="Impressions">
                            {metaAdsOverview.byPlatform.map((_, i) => (
                              <Cell key={i} fill={META_PLATFORM_COLORS[metaAdsOverview.byPlatform![i].platform?.toLowerCase()] || META_PLATFORM_COLORS.unknown} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}
                {metaAdsOverview.leadAnalytics?.byRegion && metaAdsOverview.leadAnalytics.byRegion.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl bg-white border border-gray-200/80 p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-[#1877F2]" />
                      Regions by impressions
                      <span className="text-xs font-normal text-gray-500">({metaAdsOverview.leadAnalytics.byRegion.length} regions)</span>
                    </h3>
                    <div
                      className="overflow-auto"
                      style={{ height: Math.min(560, Math.max(220, metaAdsOverview.leadAnalytics.byRegion.length * 32)) }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metaAdsOverview.leadAnalytics.byRegion} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="region" width={120} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [(v ?? 0).toLocaleString(), '']} />
                          <Bar dataKey="impressions" fill="#6366f1" radius={[0, 4, 4, 0]} name="Impressions" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}
              </div>

              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white border border-gray-200/80 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="text-base font-semibold text-gray-900">Campaigns</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Impressions, reach, forms filled, and spend per campaign</p>
                </div>
                {metaAdsOverview.campaigns?.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">No campaigns in this period.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Campaign</th>
                          <th className="px-6 py-3.5 text-right font-semibold text-gray-700">Impressions</th>
                          <th className="px-6 py-3.5 text-right font-semibold text-gray-700">Reach</th>
                          <th className="px-6 py-3.5 text-right font-semibold text-gray-700">Forms filled</th>
                          <th className="px-6 py-3.5 text-right font-semibold text-gray-700">Leads</th>
                          <th className="px-6 py-3.5 text-right font-semibold text-gray-700">Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metaAdsOverview.campaigns?.map((c, i) => (
                          <tr key={c.id} className={`border-t border-gray-100 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                            <td className="px-6 py-3.5">
                              <span className="font-medium text-gray-900">{c.name}</span>
                              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-right font-medium text-gray-800">{c.impressions.toLocaleString()}</td>
                            <td className="px-6 py-3.5 text-right font-medium text-gray-800">{c.reach.toLocaleString()}</td>
                            <td className="px-6 py-3.5 text-right font-medium text-gray-800">{c.formsFilled.toLocaleString()}</td>
                            <td className="px-6 py-3.5 text-right font-medium text-gray-800">{c.crmLeads.toLocaleString()}</td>
                            <td className="px-6 py-3.5 text-right font-bold text-gray-900">₹{parseFloat(c.spend || '0').toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white border border-gray-200/80 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Package className="h-5 w-5 text-emerald-500" />
                    Top products by interest
                  </h3>
                  {metaAdsOverview.leadAnalytics?.byProduct?.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-gray-500 text-sm">No product data</div>
                  ) : (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metaAdsOverview.leadAnalytics?.byProduct ?? []} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [v, 'Leads']} />
                          <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} name="Leads" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl bg-white border border-gray-200/80 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-sky-500" />
                    Top locations (from leads)
                  </h3>
                  {metaAdsOverview.leadAnalytics?.byLocation?.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-gray-500 text-sm">No location data</div>
                  ) : (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metaAdsOverview.leadAnalytics?.byLocation ?? []} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="location" width={100} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [v, 'Leads']} />
                          <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} name="Leads" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </motion.div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/80 p-5">
                  <p className="text-sm font-medium text-emerald-800">Total Meta leads</p>
                  <p className="text-2xl font-bold text-emerald-900">{metaAdsOverview.leadAnalytics?.totalLeads ?? 0}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">From Lead Gen API</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/80 p-5">
                  <p className="text-sm font-medium text-blue-800">Campaigns</p>
                  <p className="text-2xl font-bold text-blue-900">{metaAdsOverview.campaigns?.length ?? 0}</p>
                  <p className="text-xs text-blue-600 mt-0.5">In selected period</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200/80 p-5">
                  <p className="text-sm font-medium text-violet-800">Products tracked</p>
                  <p className="text-2xl font-bold text-violet-900">{metaAdsOverview.leadAnalytics?.byProduct?.length ?? 0}</p>
                  <p className="text-xs text-violet-600 mt-0.5">From lead interest</p>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Campaign-wise metrics */}
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
                  periodDays === opt.days ? 'bg-[#ed1b24] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Messages by direction</h3>
              {directionPieData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">No message data in this period</div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={directionPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" animationBegin={200} animationDuration={800}>
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
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Outgoing delivery status</h3>
              {statusPieData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">No outgoing messages in this period</div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" animationBegin={200} animationDuration={800}>
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

          <motion.div initial={{ opacity: 0, y: 12 }} transition={{ delay: 0.1 }} className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
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
                    <XAxis dataKey="shortDate" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.date} formatter={(value, name) => [value ?? 0, name === 'sent' ? 'Sent' : 'Received']} />
                    <Legend formatter={(v) => (v === 'sent' ? 'Sent' : 'Received')} />
                    <Area type="monotone" dataKey="sent" stroke="#25D366" fill="url(#sentGrad)" strokeWidth={2} name="sent" />
                    <Area type="monotone" dataKey="received" stroke="#34B7F1" fill="url(#receivedGrad)" strokeWidth={2} name="received" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} transition={{ delay: 0.15 }} className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Messages by template (campaign-wise)</h3>
            {templateBarData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">No template messages in this period</div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={templateBarData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} angle={templateBarData.length > 4 ? -25 : 0} textAnchor={templateBarData.length > 4 ? 'end' : 'middle'} />
                    <YAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value) => [value ?? 0, 'Messages']} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName} />
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
