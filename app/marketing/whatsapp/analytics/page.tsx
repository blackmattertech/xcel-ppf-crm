'use client'

import { useState, useEffect, useMemo, useRef, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Loader2,
  Send,
  Inbox,
  MessageCircle,
  BarChart2,
  TrendingUp,
  FileText,
  Calendar,
  ArrowLeft,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Activity,
  Percent,
  Hash,
  Zap,
  Target,
  Megaphone,
  User,
} from 'lucide-react'
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
  Area,
  Line,
  ComposedChart,
} from 'recharts'

const WA_GREEN = '#25D366'
const WA_TEAL = '#128C7E'
const WA_BLUE = '#34B7F1'
const PIE_COLORS = ['#25D366', '#128C7E', '#34B7F1', '#6366f1', '#8b5cf6', '#f59e0b', '#64748b']
const STATUS_COLORS: Record<string, string> = {
  sent: '#25D366',
  delivered: '#128C7E',
  read: '#34B7F1',
  pending: '#f59e0b',
  failed: '#ef4444',
}

interface TemplateDeliveryStatRow {
  template: string
  pending: number
  sent: number
  delivered: number
  read: number
  failed: number
  other: number
  total: number
}

interface WhatsAppAnalyticsData {
  messagesByDirection: Record<string, number>
  messagesByStatus: Record<string, number>
  messagesOverTime: Array<{ date: string; sent: number; received: number; total: number }>
  messagesByTemplate: Array<{ template: string; count: number }>
  templateDeliveryStats: TemplateDeliveryStatRow[]
  totals: { sent: number; received: number; total: number }
  period: { startDate: string; endDate: string }
}

const PERIOD_OPTIONS = [
  { label: '7d', full: 'Last 7 days', days: 7 },
  { label: '30d', full: 'Last 30 days', days: 30 },
  { label: '90d', full: 'Last 90 days', days: 90 },
] as const

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface CampaignSummaryRow {
  id: string
  templateName: string
  templateLanguage: string
  scheduledAt: string
  startedAt: string | null
  completedAt: string | null
  status: string
  recipientCount: number
  sent: number
  failed: number
  repliedCount: number
  errorMessage: string | null
}

interface CampaignFailedItem {
  phone: string
  name: string | null
  error: string
}

interface CampaignRepliedItem {
  phone: string
  name: string | null
  firstReplyAt: string
  preview: string
}

interface CampaignDetail extends CampaignSummaryRow {
  failedRecipients: CampaignFailedItem[]
  repliedRecipients: CampaignRepliedItem[]
}

interface DeliveryStatusItem {
  phone: string
  lead_id: string | null
  lead_name: string | null
}
interface DeliveryStatusResponse {
  byStatus: Record<string, { count: number; items: DeliveryStatusItem[] }>
  summary: {
    pending: number
    sent: number
    delivered: number
    read: number
    failed: number
    notDelivered: number
    notRead: number
  }
}

function formatInt(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  accent: 'green' | 'teal' | 'blue' | 'violet' | 'amber' | 'rose' | 'slate'
}) {
  const rings: Record<string, string> = {
    green: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/20',
    teal: 'from-teal-500/20 to-teal-600/5 ring-teal-500/20',
    blue: 'from-sky-500/20 to-sky-600/5 ring-sky-500/20',
    violet: 'from-violet-500/20 to-violet-600/5 ring-violet-500/20',
    amber: 'from-amber-500/20 to-amber-600/5 ring-amber-500/20',
    rose: 'from-rose-500/20 to-rose-600/5 ring-rose-500/20',
    slate: 'from-slate-500/15 to-slate-600/5 ring-slate-500/15',
  }
  const iconBg: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-600',
    teal: 'bg-teal-500/15 text-teal-600',
    blue: 'bg-sky-500/15 text-sky-600',
    violet: 'bg-violet-500/15 text-violet-600',
    amber: 'bg-amber-500/15 text-amber-600',
    rose: 'bg-rose-500/15 text-rose-600',
    slate: 'bg-slate-500/10 text-slate-600',
  }
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${rings[accent]} p-4 ring-1 shadow-sm backdrop-blur-sm transition hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-100 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icon className="h-4 w-4" />
            </span>
            {title}
          </h2>
          {subtitle && <p className="mt-1 pl-10 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function DonutWithCenter({
  data,
  dataKey,
  nameKey,
  colors,
  centerLabel,
  centerValue,
}: {
  data: Array<Record<string, unknown>>
  dataKey: string
  nameKey: string
  colors: string[]
  centerLabel: string
  centerValue: string
}) {
  const total = data.reduce((s, d) => s + (Number(d[dataKey]) || 0), 0)
  return (
    <div className="relative mx-auto h-[220px] w-full max-w-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={3}
            dataKey={dataKey}
            nameKey={nameKey}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} className="outline-none" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [formatInt(Number(value ?? 0)), 'Messages']}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.15)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{centerLabel}</span>
        <span className="text-xl font-bold tabular-nums text-slate-900">{centerValue}</span>
        <span className="text-[11px] text-slate-500">total</span>
      </div>
    </div>
  )
}

export default function WhatsAppAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<WhatsAppAnalyticsData | null>(null)
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusResponse | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignSummaryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null)
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null)
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null)
  const [campaignDetailLoading, setCampaignDetailLoading] = useState(false)
  const campaignDetailRequestRef = useRef(0)

  const [draftStartLocal, setDraftStartLocal] = useState(() => {
    const t = new Date()
    t.setDate(t.getDate() - 30)
    return toDatetimeLocalValue(t)
  })
  const [draftEndLocal, setDraftEndLocal] = useState(() => toDatetimeLocalValue(new Date()))
  const [committedRange, setCommittedRange] = useState(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    return { start: start.toISOString(), end: end.toISOString() }
  })
  const [activePresetDays, setActivePresetDays] = useState<number | null>(30)

  const periodDays = useMemo(() => {
    const ms = new Date(committedRange.end).getTime() - new Date(committedRange.start).getTime()
    return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
  }, [committedRange])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const startDate = committedRange.start
    const endDate = committedRange.end

    Promise.all([
      fetch(
        `/api/marketing/whatsapp/analytics?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&live=1`,
        { credentials: 'include' }
      ).then(async (res) => {
        if (!res.ok) throw new Error('Failed to load analytics')
        const j = await res.json()
        if (!Array.isArray(j.templateDeliveryStats)) j.templateDeliveryStats = []
        return j as WhatsAppAnalyticsData
      }),
      fetch(
        `/api/marketing/whatsapp/delivery-status?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { credentials: 'include' }
      ).then((res) =>
        res.ok
          ? res.json()
          : { byStatus: {}, summary: { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, notDelivered: 0, notRead: 0 } }
      ),
      fetch(
        `/api/marketing/whatsapp/campaign-analytics?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { credentials: 'include' }
      ).then(async (res) => {
        if (!res.ok) return { campaigns: [] as CampaignSummaryRow[] }
        const j = await res.json()
        return { campaigns: Array.isArray(j.campaigns) ? j.campaigns : [] }
      }),
    ])
      .then(([analyticsData, deliveryData, campaignPayload]) => {
        setData(analyticsData)
        setDeliveryStatus(deliveryData)
        setCampaigns(campaignPayload.campaigns)
        setExpandedCampaignId(null)
        setCampaignDetail(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [committedRange])

  const applyPreset = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    setCommittedRange({ start: start.toISOString(), end: end.toISOString() })
    setDraftStartLocal(toDatetimeLocalValue(start))
    setDraftEndLocal(toDatetimeLocalValue(end))
    setActivePresetDays(days)
  }

  const applyCustomRange = () => {
    const s = new Date(draftStartLocal)
    const e = new Date(draftEndLocal)
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) {
      setError('Invalid date range')
      return
    }
    setError(null)
    setCommittedRange({ start: s.toISOString(), end: e.toISOString() })
    setActivePresetDays(null)
  }

  const toggleCampaign = async (row: CampaignSummaryRow) => {
    if (expandedCampaignId === row.id) {
      setExpandedCampaignId(null)
      setCampaignDetail(null)
      campaignDetailRequestRef.current += 1
      return
    }
    setExpandedCampaignId(row.id)
    const reqId = ++campaignDetailRequestRef.current
    setCampaignDetailLoading(true)
    setCampaignDetail(null)
    try {
      const res = await fetch(
        `/api/marketing/whatsapp/campaign-analytics?campaignId=${encodeURIComponent(row.id)}&endDate=${encodeURIComponent(committedRange.end)}`,
        { credentials: 'include' }
      )
      const j = await res.json().catch(() => ({}))
      if (reqId !== campaignDetailRequestRef.current) return
      if (res.ok && j.campaign?.id === row.id) setCampaignDetail(j.campaign as CampaignDetail)
    } finally {
      if (reqId === campaignDetailRequestRef.current) setCampaignDetailLoading(false)
    }
  }

  const directionPieData = useMemo(() => {
    if (!data?.messagesByDirection) return []
    return [
      { name: 'Outgoing', value: data.messagesByDirection.out ?? 0 },
      { name: 'Incoming', value: data.messagesByDirection.in ?? 0 },
    ].filter((d) => d.value > 0)
  }, [data])

  const statusPieData = useMemo(() => {
    if (!data?.messagesByStatus) return []
    const order = ['sent', 'delivered', 'read', 'pending', 'failed']
    return order
      .filter((k) => (data.messagesByStatus[k] ?? 0) > 0)
      .map((k) => ({
        name: k.charAt(0).toUpperCase() + k.slice(1),
        value: data.messagesByStatus[k] ?? 0,
        key: k,
      }))
  }, [data])

  const messagesOverTimeChart = useMemo(() => {
    if (!data?.messagesOverTime?.length) return []
    return data.messagesOverTime.map((d) => ({
      ...d,
      shortDate: new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }))
  }, [data])

  const templateBarData = useMemo(() => {
    if (!data?.messagesByTemplate?.length) return []
    return data.messagesByTemplate.map((d) => ({
      name: d.template.length > 16 ? d.template.slice(0, 14) + '…' : d.template,
      fullName: d.template,
      count: d.count,
    }))
  }, [data])

  const templateTotalSends = useMemo(() => {
    if (!data?.messagesByTemplate?.length) return 0
    return data.messagesByTemplate.reduce((s, t) => s + t.count, 0)
  }, [data])

  const templateTableRows = useMemo(() => {
    if (!data?.messagesByTemplate?.length) return []
    const total = templateTotalSends || 1
    return data.messagesByTemplate.map((row, i) => ({
      rank: i + 1,
      template: row.template,
      count: row.count,
      pct: (row.count / total) * 100,
    }))
  }, [data, templateTotalSends])

  const templateDonutData = useMemo(() => {
    if (!data?.messagesByTemplate?.length) return []
    const top = data.messagesByTemplate.slice(0, 5)
    const rest = data.messagesByTemplate.slice(5).reduce((s, t) => s + t.count, 0)
    const out = top.map((t) => ({ name: t.template.length > 18 ? t.template.slice(0, 16) + '…' : t.template, value: t.count }))
    if (rest > 0) out.push({ name: 'Other templates', value: rest })
    return out
  }, [data])

  const templateDeliveryChartData = useMemo(() => {
    const rows = data?.templateDeliveryStats ?? []
    return rows.slice(0, 12).map((r) => ({
      name: r.template.length > 14 ? r.template.slice(0, 12) + '…' : r.template,
      fullName: r.template,
      Pending: r.pending,
      Sent: r.sent,
      Delivered: r.delivered,
      Read: r.read,
      Failed: r.failed,
      Other: r.other,
    }))
  }, [data?.templateDeliveryStats])

  const derivedMetrics = useMemo(() => {
    if (!data) return null
    const out = data.totals.sent
    const read = data.messagesByStatus.read ?? 0
    const delivered = data.messagesByStatus.delivered ?? 0
    const failed = data.messagesByStatus.failed ?? 0
    const readRate = out > 0 ? (read / out) * 100 : 0
    const deliveredOrRead = out > 0 ? ((delivered + read) / out) * 100 : 0
    const avgPerDay = periodDays > 0 ? data.totals.total / periodDays : 0
    const outgoingShare = data.totals.total > 0 ? (data.totals.sent / data.totals.total) * 100 : 0
    let peakDay = { date: '', total: 0 }
    for (const d of data.messagesOverTime) {
      if (d.total > peakDay.total) peakDay = { date: d.date, total: d.total }
    }
    const activeDays = data.messagesOverTime.filter((d) => d.total > 0).length
    const templateCount = data.messagesByTemplate.length
    return {
      readRate,
      deliveredOrRead,
      avgPerDay,
      outgoingShare,
      peakDay,
      activeDays,
      templateCount,
      failedOutgoing: failed,
    }
  }, [data, periodDays])

  const funnelBarData = useMemo(() => {
    if (!deliveryStatus?.summary) return []
    const s = deliveryStatus.summary
    return [
      { stage: 'Read', count: s.read, fill: STATUS_COLORS.read },
      { stage: 'Delivered', count: s.delivered, fill: STATUS_COLORS.delivered },
      { stage: 'Sent', count: s.sent, fill: STATUS_COLORS.sent },
      { stage: 'Pending', count: s.pending, fill: STATUS_COLORS.pending },
      { stage: 'Failed', count: s.failed, fill: STATUS_COLORS.failed },
    ].filter((x) => x.count > 0)
  }, [deliveryStatus])

  if (loading) {
    return (
      <div className="min-h-[50vh] space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/marketing/whatsapp"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-12 w-12 animate-spin text-[#25D366]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#25D366]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Link
              href="/marketing/whatsapp"
              className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90">Insights</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">WhatsApp Analytics</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Volume, delivery funnel, templates, and lead-level status — all in one dashboard.
              </p>
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                <Calendar className="h-3.5 w-3.5 text-emerald-300" />
                {new Date(committedRange.start).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                –{' '}
                {new Date(committedRange.end).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
          <div className="flex w-full max-w-xl flex-col gap-3 lg:max-w-none lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  title={opt.full}
                  onClick={() => applyPreset(opt.days)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activePresetDays === opt.days
                      ? 'bg-[#25D366] text-white shadow-lg shadow-emerald-900/40'
                      : 'border border-white/20 bg-white/10 text-slate-200 hover:bg-white/15'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                From
                <input
                  type="datetime-local"
                  value={draftStartLocal}
                  onChange={(e) => {
                    setDraftStartLocal(e.target.value)
                    setActivePresetDays(null)
                  }}
                  className="rounded-lg border border-white/20 bg-slate-900/40 px-2 py-2 text-sm text-white"
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                To
                <input
                  type="datetime-local"
                  value={draftEndLocal}
                  onChange={(e) => {
                    setDraftEndLocal(e.target.value)
                    setActivePresetDays(null)
                  }}
                  className="rounded-lg border border-white/20 bg-slate-900/40 px-2 py-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={applyCustomRange}
                className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/25"
              >
                Apply range
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {data && derivedMetrics && (
        <>
          {/* KPI grid */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard icon={MessageCircle} label="Total messages" value={formatInt(data.totals.total)} sub={`${formatInt(derivedMetrics.activeDays)} active days`} accent="slate" />
            <KpiCard icon={Send} label="Outgoing" value={formatInt(data.totals.sent)} sub={`${formatPct(derivedMetrics.outgoingShare)} of all traffic`} accent="green" />
            <KpiCard icon={Inbox} label="Incoming" value={formatInt(data.totals.received)} sub="Replies & inbound" accent="teal" />
            <KpiCard icon={Activity} label="Avg / day" value={derivedMetrics.avgPerDay < 10 ? derivedMetrics.avgPerDay.toFixed(1) : formatInt(Math.round(derivedMetrics.avgPerDay))} sub="Messages per calendar day" accent="blue" />
            <KpiCard icon={Target} label="Read rate" value={formatPct(derivedMetrics.readRate)} sub="Read ÷ outgoing" accent="violet" />
            <KpiCard icon={Percent} label="Delivered + read" value={formatPct(derivedMetrics.deliveredOrRead)} sub="Of outgoing messages" accent="teal" />
            <KpiCard icon={Hash} label="Templates used" value={formatInt(derivedMetrics.templateCount)} sub={`${formatInt(templateTotalSends)} template sends`} accent="amber" />
            <KpiCard icon={Zap} label="Busiest day" value={derivedMetrics.peakDay.total > 0 ? formatInt(derivedMetrics.peakDay.total) : '—'} sub={derivedMetrics.peakDay.date ? new Date(derivedMetrics.peakDay.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No spikes yet'} accent="amber" />
            <KpiCard icon={AlertCircle} label="Failed (out)" value={formatInt(derivedMetrics.failedOutgoing)} sub="Outgoing delivery errors" accent="rose" />
          </section>

          {/* Donuts row */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Traffic mix" subtitle="Outgoing vs incoming in this period" icon={BarChart2}>
              {directionPieData.length > 0 ? (
                <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
                  <DonutWithCenter
                    data={directionPieData as unknown as Array<Record<string, unknown>>}
                    dataKey="value"
                    nameKey="name"
                    colors={[WA_GREEN, WA_TEAL]}
                    centerLabel="Messages"
                    centerValue={formatInt(data.totals.total)}
                  />
                  <div className="space-y-2">
                    {directionPieData.map((d, i) => {
                      const pct = data.totals.total > 0 ? (d.value / data.totals.total) * 100 : 0
                      return (
                        <div
                          key={d.name}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="font-medium text-slate-800">{d.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold tabular-nums text-slate-900">{formatInt(d.value)}</span>
                            <span className="ml-2 text-xs text-slate-500">{formatPct(pct)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">No messages in this range</p>
              )}
            </ChartCard>

            <ChartCard title="Outgoing lifecycle" subtitle="Sent → delivered → read (message counts)" icon={TrendingUp}>
              {statusPieData.length > 0 ? (
                <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
                  <DonutWithCenter
                    data={statusPieData as unknown as Array<Record<string, unknown>>}
                    dataKey="value"
                    nameKey="name"
                    colors={statusPieData.map((d) => STATUS_COLORS[d.key] ?? '#64748b')}
                    centerLabel="Outgoing"
                    centerValue={formatInt(data.totals.sent)}
                  />
                  <div className="overflow-hidden rounded-xl border border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5 text-right">Count</th>
                          <th className="px-4 py-2.5 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statusPieData.map((row) => {
                          const pct = data.totals.sent > 0 ? (row.value / data.totals.sent) * 100 : 0
                          return (
                            <tr key={row.key} className="border-b border-slate-50 last:border-0">
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[row.key] }} />
                                  <span className="font-medium text-slate-800">{row.name}</span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{formatInt(row.value)}</td>
                              <td className="px-4 py-2.5 text-right text-slate-600">{formatPct(pct)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">No outgoing messages</p>
              )}
            </ChartCard>
          </section>

          {/* Trend */}
          <ChartCard title="Activity trend" subtitle="Daily sent vs received" icon={Activity} className="overflow-hidden">
            {messagesOverTimeChart.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={messagesOverTimeChart} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={WA_GREEN} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={WA_GREEN} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradRecv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={WA_TEAL} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={WA_TEAL} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      labelFormatter={(_, payload) => {
                        const raw = payload?.[0]?.payload?.date as string | undefined
                        return raw
                          ? new Date(raw + 'T12:00:00').toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : ''
                      }}
                      formatter={(value, name) => [
                        formatInt(Number(value ?? 0)),
                        name === 'sent' ? 'Sent' : name === 'received' ? 'Received' : 'Total',
                      ]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 12px 40px -12px rgb(0 0 0 / 0.2)',
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 16 }} />
                    <Area type="monotone" dataKey="sent" stroke={WA_GREEN} strokeWidth={2} fill="url(#gradSent)" name="Sent" />
                    <Area type="monotone" dataKey="received" stroke={WA_TEAL} strokeWidth={2} fill="url(#gradRecv)" name="Received" />
                    <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={false} name="Total" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-slate-500">No time-series data</p>
            )}
          </ChartCard>

          {/* Templates */}
          <ChartCard title="Template performance" subtitle="Broadcasts recorded as template sends in CRM" icon={FileText}>
            {templateBarData.length > 0 ? (
              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Top templates (share)</p>
                  <div className="mx-auto h-[240px] max-w-sm">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={templateDonutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={88}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {templateDonutData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [formatInt(Number(v ?? 0)), 'Sends']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Volume by template</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={templateBarData} layout="vertical" margin={{ left: 4, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Tooltip
                          formatter={(value) => [formatInt(Number(value ?? 0)), 'Sends']}
                          labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="count" radius={[0, 8, 8, 0]} fill={WA_GREEN} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : null}
            {templateTableRows.length > 0 ? (
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Template</th>
                      <th className="px-4 py-3 text-right">Sends</th>
                      <th className="px-4 py-3 text-right">% of sends</th>
                      <th className="hidden px-4 py-3 sm:table-cell">Mix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateTableRows.map((row) => (
                      <tr key={row.template} className="border-b border-slate-100 transition hover:bg-slate-50/80 last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.rank}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.template}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{formatInt(row.count)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatPct(row.pct)}</td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.min(100, row.pct)}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No template-tagged sends in this period</p>
            )}
          </ChartCard>

          {/* Per-template delivery breakdown */}
          <ChartCard
            title="Template × delivery status"
            subtitle="Outgoing messages tagged with [Template: name], split by CRM/Meta status"
            icon={Target}
          >
            {(data.templateDeliveryStats?.length ?? 0) > 0 ? (
              <>
                {templateDeliveryChartData.length > 0 && (
                  <div className="mb-8 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={templateDeliveryChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-28} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={36} />
                        <Tooltip
                          formatter={(value, name) => [formatInt(Number(value ?? 0)), String(name)]}
                          labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: 8 }} />
                        <Bar dataKey="Pending" stackId="a" fill={STATUS_COLORS.pending} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Sent" stackId="a" fill={STATUS_COLORS.sent} />
                        <Bar dataKey="Delivered" stackId="a" fill={STATUS_COLORS.delivered} />
                        <Bar dataKey="Read" stackId="a" fill={STATUS_COLORS.read} />
                        <Bar dataKey="Failed" stackId="a" fill={STATUS_COLORS.failed} />
                        <Bar dataKey="Other" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">#</th>
                        <th className="min-w-[140px] px-4 py-3">Template</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">Pending</th>
                        <th className="px-4 py-3 text-right">Sent</th>
                        <th className="px-4 py-3 text-right">Delivered</th>
                        <th className="px-4 py-3 text-right">Read</th>
                        <th className="px-4 py-3 text-right">Failed</th>
                        <th className="px-4 py-3 text-right">Other</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.templateDeliveryStats ?? []).map((row, i) => (
                        <tr key={row.template} className="border-b border-slate-100 transition hover:bg-slate-50/80 last:border-0">
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{i + 1}</td>
                          <td className="min-w-[140px] px-4 py-3 font-medium text-slate-900">{row.template}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{formatInt(row.total)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-amber-700">{formatInt(row.pending)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatInt(row.sent)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-teal-700">{formatInt(row.delivered)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-sky-700">{formatInt(row.read)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-rose-700">{formatInt(row.failed)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatInt(row.other)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No per-template delivery data in this period</p>
            )}
          </ChartCard>

          <ChartCard
            title="Broadcast campaigns"
            subtitle="Template broadcasts you scheduled or queued (replies = first inbound message per recipient in the selected period, after send started)"
            icon={Megaphone}
          >
            {campaigns.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No campaigns in this range. Sends appear here after you use Bulk broadcast or scheduled jobs.
              </p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => {
                  const expanded = expandedCampaignId === c.id
                  return (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => toggleCampaign(c)}
                        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="flex items-start gap-2">
                          {expanded ? (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          ) : (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          )}
                          <span>
                            <span className="font-semibold text-slate-900">{c.templateName}</span>
                            <span className="ml-2 text-xs font-normal text-slate-500">{c.templateLanguage}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {new Date(c.scheduledAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              · {c.status}
                              {c.errorMessage ? ` · ${c.errorMessage}` : ''}
                            </span>
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-2 pl-7 sm:pl-0">
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {formatInt(c.recipientCount)} recipients
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            {formatInt(c.sent)} sent
                          </span>
                          <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                            {formatInt(c.failed)} failed
                          </span>
                          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                            {formatInt(c.repliedCount)} replied
                          </span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                          {campaignDetailLoading && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading details…
                            </div>
                          )}
                          {!campaignDetailLoading && campaignDetail && campaignDetail.id === c.id && (
                            <div className="grid gap-6 lg:grid-cols-2">
                              <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-700">
                                  Failed ({formatInt(campaignDetail.failedRecipients.length)})
                                </p>
                                {campaignDetail.failedRecipients.length === 0 ? (
                                  <p className="text-sm text-slate-500">None recorded for this job.</p>
                                ) : (
                                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-sm">
                                    {campaignDetail.failedRecipients.map((f, i) => (
                                      <li key={i} className="flex flex-col gap-0.5 border-b border-slate-50 pb-2 last:border-0">
                                        <span className="flex items-center justify-between gap-2">
                                          <span className="truncate font-medium text-slate-800">{f.name || '—'}</span>
                                          <span className="shrink-0 font-mono text-xs text-slate-500">{f.phone}</span>
                                        </span>
                                        <span className="text-xs text-rose-700">{f.error}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-700">
                                  Replied ({formatInt(campaignDetail.repliedRecipients.length)})
                                </p>
                                {campaignDetail.repliedRecipients.length === 0 ? (
                                  <p className="text-sm text-slate-500">No inbound replies in range after send started.</p>
                                ) : (
                                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-sm">
                                    {campaignDetail.repliedRecipients.map((r, i) => (
                                      <li key={i} className="flex flex-col gap-0.5 border-b border-slate-50 pb-2 last:border-0">
                                        <span className="flex items-center justify-between gap-2">
                                          <span className="flex items-center gap-1.5 truncate font-medium text-slate-800">
                                            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            {r.name || '—'}
                                          </span>
                                          <span className="shrink-0 font-mono text-xs text-slate-500">{r.phone}</span>
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                          {new Date(r.firstReplyAt).toLocaleString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                        <span className="text-xs text-slate-600">&ldquo;{r.preview}&rdquo;</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ChartCard>

          {/* Delivery + leads */}
          {deliveryStatus && (
            <ChartCard title="Delivery & leads" subtitle="Distinct leads / numbers by Meta delivery state (outgoing)" icon={AlertCircle}>
              <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 ring-1 ring-amber-100">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-800/80">Not delivered</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-amber-950">{formatInt(deliveryStatus.summary.notDelivered)}</p>
                  <p className="mt-1 text-xs text-amber-800/80">Pending or sent only</p>
                </div>
                <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-blue-50/50 p-4 ring-1 ring-sky-100">
                  <p className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Not read</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-sky-950">{formatInt(deliveryStatus.summary.notRead)}</p>
                  <p className="mt-1 text-xs text-sky-800/80">Before “read” state</p>
                </div>
                <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 to-red-50/50 p-4 ring-1 ring-rose-100">
                  <p className="text-xs font-bold uppercase tracking-wide text-rose-800/80">Failed</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-rose-950">{formatInt(deliveryStatus.summary.failed)}</p>
                  <p className="mt-1 text-xs text-rose-800/80">Meta delivery errors</p>
                </div>
              </div>

              {funnelBarData.length > 0 && (
                <div className="mb-8 h-52">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lead counts by stage</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelBarData} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="stage" width={88} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [formatInt(Number(v ?? 0)), 'Leads']} />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                        {funnelBarData.map((e, i) => (
                          <Cell key={i} fill={e.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2.5">Stage</th>
                      <th className="px-4 py-2.5 text-right">Leads / numbers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: 'read', label: 'Read' },
                      { key: 'delivered', label: 'Delivered (not read)' },
                      { key: 'sent', label: 'Sent' },
                      { key: 'pending', label: 'Pending' },
                      { key: 'failed', label: 'Failed' },
                    ].map(({ key, label }) => (
                      <tr key={key} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{label}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {formatInt(deliveryStatus.summary[key as keyof DeliveryStatusResponse['summary']] as number)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2">
                {[
                  { key: 'failed', label: 'Failed' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'sent', label: 'Sent (not delivered)' },
                  { key: 'delivered', label: 'Delivered (not read)' },
                  { key: 'read', label: 'Read' },
                ].map(({ key, label }) => {
                  const isExpanded = expandedStatus === key
                  const items = deliveryStatus.byStatus[key]?.items ?? []
                  const summary = deliveryStatus.summary[key as keyof DeliveryStatusResponse['summary']] as number
                  return (
                    <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => setExpandedStatus(isExpanded ? null : key)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2 font-semibold text-slate-900">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                          {label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-bold tabular-nums text-slate-800">{formatInt(summary)}</span>
                      </button>
                      {isExpanded && items.length > 0 && (
                        <div className="max-h-52 overflow-y-auto border-t border-slate-100 bg-slate-50/50">
                          <ul className="divide-y divide-slate-100">
                            {items.map((item, i) => (
                              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <span className="truncate font-medium text-slate-800">{item.lead_name || '—'}</span>
                                <span className="shrink-0 font-mono text-xs text-slate-500">{item.phone}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {deliveryStatus.summary.failed > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-6">
                  <Link
                    href="/marketing/bulk-whatsapp?retry=failed"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#20BA5A]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry failed campaign
                  </Link>
                  <p className="mt-2 text-xs text-slate-500">Opens Bulk WhatsApp with failed numbers prefilled.</p>
                </div>
              )}
            </ChartCard>
          )}

          <footer className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-center text-xs text-slate-500">
            Charts use live <code className="rounded bg-slate-100 px-1">whatsapp_messages</code> in your range. Campaigns list your{' '}
            <code className="rounded bg-slate-100 px-1">scheduled_broadcasts</code>. Reply matching uses the last 10 digits of the phone.
          </footer>
        </>
      )}
    </div>
  )
}
