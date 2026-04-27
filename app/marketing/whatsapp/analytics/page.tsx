'use client'

import { useState, useEffect, useMemo, useRef, type ComponentType } from 'react'
import Link from 'next/link'
import {
  Loader2,
  Send,
  Calendar,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Activity,
  Megaphone,
  User,
  ExternalLink,
  CheckCheck,
  XCircle,
  Reply,
  MousePointerClick,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowRight,
  Award,
} from 'lucide-react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  ComposedChart,
} from 'recharts'

const WA_GREEN = '#25D366'
const WA_TEAL = '#128C7E'

// ─── interfaces ──────────────────────────────────────────────────────────────

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

interface TemplateRecipient {
  phone: string
  lead_id: string | null
  lead_name: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  sent_at: string
  replied: boolean
}

interface TemplateRecipientsData {
  recipients: TemplateRecipient[]
  summary: {
    total: number
    sent: number
    delivered: number
    read: number
    failed: number
    notSent: number
    replied: number
  }
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

interface CampaignFailedItem { phone: string; name: string | null; error: string }
interface CampaignRepliedItem { phone: string; name: string | null; firstReplyAt: string; preview: string }
interface CampaignDetail extends CampaignSummaryRow {
  failedRecipients: CampaignFailedItem[]
  repliedRecipients: CampaignRepliedItem[]
}

interface DeliveryStatusItem { phone: string; lead_id: string | null; lead_name: string | null }
interface DeliveryStatusResponse {
  byStatus: Record<string, { count: number; items: DeliveryStatusItem[] }>
  summary: { pending: number; sent: number; delivered: number; read: number; failed: number; notDelivered: number; notRead: number }
}

interface MetaClickDetail { type: string; button_content: string; count: number }
interface MetaTemplateMetric {
  templateId: string
  templateName: string
  sent: number
  delivered: number
  read: number
  clicked: number
  clickDetails: MetaClickDetail[]
  readRate: number
  deliverRate: number
  failed: number
  notSent: number
}
interface MetaAnalyticsResponse {
  source: 'meta'
  overall: { sent: number; delivered: number }
  templates: MetaTemplateMetric[]
  period: { startDate: string; endDate: string }
  granularity: 'DAILY' | 'MONTHLY'
}
interface MetaAnalyticsError {
  source: 'unavailable'
  reason: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '7d', full: 'Last 7 days', days: 7 },
  { label: '30d', full: 'Last 30 days', days: 30 },
  { label: '90d', full: 'Last 90 days', days: 90 },
] as const

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatInt(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  if (!Number.isFinite(n) || isNaN(n)) return '—'
  return `${n.toFixed(1)}%`
}

function inboxUrl(phone: string, lead_id: string | null, lead_name: string | null): string {
  const p = new URLSearchParams({ phone })
  if (lead_id) p.set('leadId', lead_id)
  if (lead_name) p.set('name', lead_name)
  return `/marketing/chat?${p.toString()}`
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    read: { label: 'Read', className: 'bg-sky-100 text-sky-800' },
    delivered: { label: 'Delivered', className: 'bg-teal-100 text-teal-800' },
    sent: { label: 'Sent', className: 'bg-emerald-100 text-emerald-800' },
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
    failed: { label: 'Failed', className: 'bg-rose-100 text-rose-800' },
    completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800' },
    processing: { label: 'Processing', className: 'bg-blue-100 text-blue-800' },
  }
  const c = config[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.className}`}>
      {c.label}
    </span>
  )
}

// Funnel Step component
function FunnelStep({
  label,
  value,
  pct,
  color,
  subLabel,
  isLast = false,
}: {
  label: string
  value: number
  pct: number | null
  color: string
  subLabel?: string
  isLast?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div className={`w-full rounded-xl border-2 p-3 text-center ${color}`}>
        <p className="text-xl font-bold tabular-nums">{formatInt(value)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5 opacity-80">{label}</p>
        {subLabel && <p className="text-[10px] opacity-60 mt-0.5">{subLabel}</p>}
      </div>
      {!isLast && (
        <div className="flex flex-col items-center gap-0.5 py-1">
          {pct !== null && (
            <span className={`text-[10px] font-bold ${pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
              {formatPct(pct)}
            </span>
          )}
          <ArrowRight className="h-4 w-4 text-slate-300 rotate-90 sm:rotate-0" />
        </div>
      )}
    </div>
  )
}

// KPI Card
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  trend,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  accent: 'green' | 'teal' | 'blue' | 'violet' | 'amber' | 'rose' | 'slate'
  trend?: 'up' | 'down' | 'neutral'
}) {
  const rings: Record<string, string> = {
    green: 'from-emerald-500/10 to-emerald-600/5 ring-emerald-500/20',
    teal: 'from-teal-500/10 to-teal-600/5 ring-teal-500/20',
    blue: 'from-sky-500/10 to-sky-600/5 ring-sky-500/20',
    violet: 'from-violet-500/10 to-violet-600/5 ring-violet-500/20',
    amber: 'from-amber-500/10 to-amber-600/5 ring-amber-500/20',
    rose: 'from-rose-500/10 to-rose-600/5 ring-rose-500/20',
    slate: 'from-slate-500/8 to-slate-600/5 ring-slate-500/15',
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
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${rings[accent]} p-4 ring-1 shadow-sm backdrop-blur-sm transition hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg[accent]}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
          {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
        </div>
      </div>
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function WhatsAppAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<WhatsAppAnalyticsData | null>(null)
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusResponse | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignSummaryRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [metaAnalytics, setMetaAnalytics] = useState<MetaAnalyticsResponse | MetaAnalyticsError | null>(null)

  // Template recipient drill-down
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [templateRecipients, setTemplateRecipients] = useState<Record<string, TemplateRecipientsData>>({})
  const [templateLoading, setTemplateLoading] = useState<string | null>(null)
  const [templateRecipientFilter, setTemplateRecipientFilter] = useState<
    Record<string, 'all' | 'sent' | 'delivered' | 'read' | 'failed' | 'replied'>
  >({})

  // Campaign drill-down
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null)
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null)
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null)
  const [campaignDetailLoading, setCampaignDetailLoading] = useState(false)
  const campaignDetailRequestRef = useRef(0)

  const [draftStartLocal, setDraftStartLocal] = useState(() => {
    const t = new Date(); t.setDate(t.getDate() - 30); return toDatetimeLocalValue(t)
  })
  const [draftEndLocal, setDraftEndLocal] = useState(() => toDatetimeLocalValue(new Date()))
  const [committedRange, setCommittedRange] = useState(() => {
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30)
    return { start: start.toISOString(), end: end.toISOString() }
  })
  const [activePresetDays, setActivePresetDays] = useState<number | null>(30)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setExpandedTemplate(null)
    setTemplateRecipients({})
    const { start, end } = committedRange

    Promise.all([
      fetch(`/api/marketing/whatsapp/analytics?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&live=1`, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) throw new Error('Failed to load analytics')
          const j = await res.json()
          if (!Array.isArray(j.templateDeliveryStats)) j.templateDeliveryStats = []
          return j as WhatsAppAnalyticsData
        }),
      fetch(`/api/marketing/whatsapp/delivery-status?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, { credentials: 'include' })
        .then((res) => res.ok ? res.json() : { byStatus: {}, summary: { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, notDelivered: 0, notRead: 0 } }),
      fetch(`/api/marketing/whatsapp/campaign-analytics?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) return { campaigns: [] as CampaignSummaryRow[] }
          const j = await res.json()
          return { campaigns: Array.isArray(j.campaigns) ? j.campaigns : [] }
        }),
      fetch(`/api/marketing/whatsapp/meta-analytics?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&live=1`, { credentials: 'include' })
        .then((res) => res.json().catch(() => ({ source: 'unavailable', reason: 'Parse error' })))
        .catch(() => ({ source: 'unavailable', reason: 'Network error' })),
    ])
      .then(([analyticsData, deliveryData, campaignPayload, metaData]) => {
        setData(analyticsData)
        setDeliveryStatus(deliveryData)
        setCampaigns(campaignPayload.campaigns)
        setMetaAnalytics(metaData as MetaAnalyticsResponse | MetaAnalyticsError)
        setExpandedCampaignId(null)
        setCampaignDetail(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [committedRange])

  const applyPreset = (days: number) => {
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days)
    setCommittedRange({ start: start.toISOString(), end: end.toISOString() })
    setDraftStartLocal(toDatetimeLocalValue(start))
    setDraftEndLocal(toDatetimeLocalValue(end))
    setActivePresetDays(days)
  }

  const applyCustomRange = () => {
    const s = new Date(draftStartLocal); const e = new Date(draftEndLocal)
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) { setError('Invalid date range'); return }
    setError(null)
    setCommittedRange({ start: s.toISOString(), end: e.toISOString() })
    setActivePresetDays(null)
  }

  const toggleTemplate = async (templateName: string) => {
    if (expandedTemplate === templateName) { setExpandedTemplate(null); return }
    setExpandedTemplate(templateName)
    setTemplateRecipientFilter((prev) => (prev[templateName] ? prev : { ...prev, [templateName]: 'all' }))
    if (templateRecipients[templateName]) return
    setTemplateLoading(templateName)
    try {
      const { start, end } = committedRange
      const res = await fetch(
        `/api/marketing/whatsapp/template-recipients?templateName=${encodeURIComponent(templateName)}&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
        { credentials: 'include' }
      )
      const j = await res.json().catch(() => ({}))
      if (res.ok) setTemplateRecipients((prev) => ({ ...prev, [templateName]: j }))
    } finally {
      setTemplateLoading(null)
    }
  }

  const toggleCampaign = async (row: CampaignSummaryRow) => {
    if (expandedCampaignId === row.id) { setExpandedCampaignId(null); setCampaignDetail(null); campaignDetailRequestRef.current += 1; return }
    setExpandedCampaignId(row.id)
    const reqId = ++campaignDetailRequestRef.current
    setCampaignDetailLoading(true); setCampaignDetail(null)
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

  const messagesOverTimeChart = useMemo(() => {
    if (!data?.messagesOverTime?.length) return []
    return data.messagesOverTime.map((d) => ({
      ...d,
      shortDate: new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }))
  }, [data])

  // Unified metrics — prefer Meta data if available, fallback to CRM
  const metrics = useMemo(() => {
    const crmSent = data?.totals.sent ?? 0
    const crmRead = data?.messagesByStatus.read ?? 0
    const crmDelivered = data?.messagesByStatus.delivered ?? 0
    const crmFailed = data?.messagesByStatus.failed ?? 0
    const crmReplied = data?.totals.received ?? 0

    const hasMeta = metaAnalytics?.source === 'meta'
    const meta = hasMeta ? (metaAnalytics as MetaAnalyticsResponse) : null

    const metaTotalSent = meta ? (meta.overall.sent || meta.templates.reduce((s, t) => s + t.sent, 0)) : 0
    const metaTotalDelivered = meta ? (meta.overall.delivered || meta.templates.reduce((s, t) => s + t.delivered, 0)) : 0
    const metaTotalRead = meta ? meta.templates.reduce((s, t) => s + t.read, 0) : 0
    const metaTotalClicked = meta ? meta.templates.reduce((s, t) => s + t.clicked, 0) : 0
    const metaTotalFailed = meta ? meta.templates.reduce((s, t) => s + t.failed, 0) : 0

    const sent = hasMeta && metaTotalSent > 0 ? metaTotalSent : crmSent
    const delivered = hasMeta && metaTotalDelivered > 0 ? metaTotalDelivered : crmDelivered + crmRead
    const read = hasMeta && metaTotalRead > 0 ? metaTotalRead : crmRead
    const failed = hasMeta && metaTotalFailed > 0 ? metaTotalFailed : crmFailed
    const clicked = metaTotalClicked
    const replied = crmReplied

    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0
    const readRate = sent > 0 ? (read / sent) * 100 : 0
    const replyRate = sent > 0 ? (replied / sent) * 100 : 0
    const failureRate = sent > 0 ? (failed / sent) * 100 : 0
    const clickRate = sent > 0 ? (clicked / sent) * 100 : 0

    // Unique contacts from deliveryStatus
    const ds = deliveryStatus?.summary
    const uniqueContacts = ds ? (ds.read + ds.delivered + ds.sent + ds.failed + ds.pending) : 0

    return {
      sent, delivered, read, failed, clicked, replied,
      deliveryRate, readRate, replyRate, failureRate, clickRate,
      uniqueContacts,
      source: hasMeta ? 'meta' : 'crm',
    }
  }, [data, metaAnalytics, deliveryStatus])

  // Template performance sorted by read rate
  const templatePerformance = useMemo(() => {
    if (!data?.templateDeliveryStats?.length) return []
    return [...data.templateDeliveryStats]
      .map((row) => {
        const totalOut = row.sent + row.delivered + row.read + row.pending + row.failed
        const effectiveSent = totalOut || 1
        const deliveryRate = ((row.delivered + row.read) / effectiveSent) * 100
        const readRate = (row.read / effectiveSent) * 100
        const failRate = (row.failed / effectiveSent) * 100
        return { ...row, effectiveSent, deliveryRate, readRate, failRate }
      })
      .sort((a, b) => b.readRate - a.readRate)
  }, [data])

  // Campaign metrics summary
  const campaignMetrics = useMemo(() => {
    if (!campaigns.length) return null
    const totalCampaigns = campaigns.length
    const completedCampaigns = campaigns.filter(c => c.status === 'completed').length
    const totalRecipients = campaigns.reduce((s, c) => s + c.recipientCount, 0)
    const totalSent = campaigns.reduce((s, c) => s + c.sent, 0)
    const totalFailed = campaigns.reduce((s, c) => s + c.failed, 0)
    const totalReplied = campaigns.reduce((s, c) => s + c.repliedCount, 0)
    const avgReplyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0

    // Best campaign by reply rate
    const best = campaigns
      .filter(c => c.sent > 0)
      .map(c => ({ ...c, replyRate: (c.repliedCount / c.sent) * 100 }))
      .sort((a, b) => b.replyRate - a.replyRate)[0] ?? null

    return { totalCampaigns, completedCampaigns, totalRecipients, totalSent, totalFailed, totalReplied, avgReplyRate, best }
  }, [campaigns])

  if (loading) {
    return (
      <div className="min-h-[50vh] space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/marketing/whatsapp" className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200" />
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-12 w-12 animate-spin text-[#25D366]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">

      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#25D366]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Link href="/marketing/whatsapp" className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white backdrop-blur-sm transition hover:bg-white/20">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90">Campaign Intelligence</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">WhatsApp Analytics</h1>
              <p className="mt-1.5 text-sm text-slate-300/80">
                Delivery funnel · Template ROI · Campaign performance · Audience reach
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                  <Calendar className="h-3.5 w-3.5 text-emerald-300" />
                  {new Date(committedRange.start).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' – '}
                  {new Date(committedRange.end).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {metrics.source === 'meta' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> Meta Verified Data
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                    <Activity className="h-3 w-3" /> CRM Data
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex w-full max-w-xl flex-col gap-3 lg:max-w-none lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <button key={opt.days} type="button" title={opt.full} onClick={() => applyPreset(opt.days)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activePresetDays === opt.days ? 'bg-[#25D366] text-white shadow-lg shadow-emerald-900/40' : 'border border-white/20 bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                From
                <input type="datetime-local" value={draftStartLocal}
                  onChange={(e) => { setDraftStartLocal(e.target.value); setActivePresetDays(null) }}
                  className="rounded-lg border border-white/20 bg-slate-900/40 px-2 py-2 text-sm text-white" />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                To
                <input type="datetime-local" value={draftEndLocal}
                  onChange={(e) => { setDraftEndLocal(e.target.value); setActivePresetDays(null) }}
                  className="rounded-lg border border-white/20 bg-slate-900/40 px-2 py-2 text-sm text-white" />
              </label>
              <button type="button" onClick={applyCustomRange} className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/25">
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      )}

      {/* ── Meta unavailable notice ── */}
      {metaAnalytics?.source === 'unavailable' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            <strong>Meta API not connected —</strong> showing CRM webhook data.{' '}
            <Link href="/marketing/whatsapp" className="underline font-medium">Configure WABA credentials</Link> to unlock verified Meta Insights.
          </p>
        </div>
      )}

      {data && (
        <>
          {/* ══════════════════════════════════════════════════════════════
              SECTION 1 — DELIVERY FUNNEL (top-priority business view)
          ══════════════════════════════════════════════════════════════ */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Delivery Funnel</h2>
                <p className="text-xs text-slate-500">End-to-end message journey — how many leads actually engaged</p>
              </div>
              {metrics.source === 'meta' && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> Meta Verified
                </span>
              )}
            </div>

            {/* Funnel bar */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-100">
              {/* Visual funnel steps */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
                <FunnelStep
                  label="Sent"
                  value={metrics.sent}
                  pct={null}
                  color="border-emerald-300 bg-emerald-50 text-emerald-900"
                  subLabel="accepted by Meta"
                />
                <FunnelStep
                  label="Delivered"
                  value={metrics.delivered}
                  pct={metrics.deliveryRate}
                  color="border-teal-300 bg-teal-50 text-teal-900"
                  subLabel="reached device"
                />
                <FunnelStep
                  label="Read"
                  value={metrics.read}
                  pct={metrics.readRate}
                  color="border-sky-300 bg-sky-50 text-sky-900"
                  subLabel="message opened"
                />
                <FunnelStep
                  label="Replied"
                  value={metrics.replied}
                  pct={metrics.replyRate}
                  color="border-violet-300 bg-violet-50 text-violet-900"
                  subLabel="responded back"
                />
                <FunnelStep
                  label="Failed"
                  value={metrics.failed}
                  pct={null}
                  color="border-rose-300 bg-rose-50 text-rose-900"
                  subLabel="not delivered"
                  isLast
                />
              </div>

              {/* Progress bar */}
              <div className="mt-5 space-y-1.5">
                <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-sky-400 transition-all" style={{ width: `${(metrics.read / (metrics.sent || 1)) * 100}%` }} title={`Read: ${formatPct(metrics.readRate)}`} />
                  <div className="h-full bg-teal-400 transition-all" style={{ width: `${Math.max(0, (metrics.delivered - metrics.read) / (metrics.sent || 1)) * 100}%` }} title="Delivered (not read)" />
                  <div className="h-full bg-emerald-300 transition-all" style={{ width: `${Math.max(0, (metrics.sent - metrics.delivered - metrics.failed) / (metrics.sent || 1)) * 100}%` }} title="Sent (pending delivery)" />
                  <div className="ml-auto h-full bg-rose-400 transition-all" style={{ width: `${(metrics.failed / (metrics.sent || 1)) * 100}%` }} title="Failed" />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" />Read {formatPct(metrics.readRate)}</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400" />Delivered {formatPct(metrics.deliveryRate)}</span>
                  {metrics.clicked > 0 && <span className="flex items-center gap-1 text-violet-600"><MousePointerClick className="h-3 w-3" />Clicked {formatPct(metrics.clickRate)}</span>}
                  {metrics.failed > 0 && <span className="flex items-center gap-1 text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-400" />Failed {formatPct(metrics.failureRate)}</span>}
                </div>
              </div>

              {/* Drop-off insight */}
              {metrics.sent > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {metrics.deliveryRate < 90 && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <strong>{formatInt(metrics.sent - metrics.delivered)}</strong> messages not delivered — check DND/opt-out list
                    </div>
                  )}
                  {metrics.readRate < 40 && metrics.deliveryRate > 70 && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Low read rate — try improving message content or sending time
                    </div>
                  )}
                  {metrics.replyRate > 5 && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                      <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                      Strong reply rate ({formatPct(metrics.replyRate)}) — good audience engagement
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2 — KEY METRICS GRID
          ══════════════════════════════════════════════════════════════ */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <KpiCard
              icon={Users}
              label="Unique Contacts Reached"
              value={metrics.uniqueContacts > 0 ? formatInt(metrics.uniqueContacts) : formatInt(metrics.sent)}
              sub="distinct leads messaged"
              accent="green"
            />
            <KpiCard
              icon={TrendingUp}
              label="Read Rate"
              value={formatPct(metrics.readRate)}
              sub={`${formatInt(metrics.read)} messages read`}
              accent={metrics.readRate >= 50 ? 'blue' : metrics.readRate >= 30 ? 'amber' : 'rose'}
            />
            <KpiCard
              icon={Reply}
              label="Reply Rate"
              value={formatPct(metrics.replyRate)}
              sub={`${formatInt(metrics.replied)} inbound replies`}
              accent="violet"
            />
            <KpiCard
              icon={XCircle}
              label="Failure Rate"
              value={formatPct(metrics.failureRate)}
              sub={`${formatInt(metrics.failed)} undelivered`}
              accent={metrics.failureRate > 10 ? 'rose' : 'slate'}
            />
            <KpiCard
              icon={Send}
              label="Total Sent"
              value={formatInt(metrics.sent)}
              sub="outbound messages"
              accent="green"
            />
            <KpiCard
              icon={CheckCheck}
              label="Delivery Rate"
              value={formatPct(metrics.deliveryRate)}
              sub={`${formatInt(metrics.delivered)} delivered`}
              accent={metrics.deliveryRate >= 85 ? 'teal' : 'amber'}
            />
            {metrics.clicked > 0 && (
              <KpiCard
                icon={MousePointerClick}
                label="Button Click Rate"
                value={formatPct(metrics.clickRate)}
                sub={`${formatInt(metrics.clicked)} total clicks`}
                accent="violet"
              />
            )}
            <KpiCard
              icon={Megaphone}
              label="Campaigns Run"
              value={formatInt(campaigns.length)}
              sub={campaignMetrics ? `${formatInt(campaignMetrics.completedCampaigns)} completed` : 'this period'}
              accent="amber"
            />
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3 — TEMPLATE PERFORMANCE (ranked by read rate)
          ══════════════════════════════════════════════════════════════ */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Award className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Template Performance</h2>
                <p className="text-xs text-slate-500">Ranked by read rate — identify your best and worst performing templates</p>
              </div>
            </div>

            {templatePerformance.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-12 text-center text-sm text-slate-500">
                No template sends in this period.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* Table header */}
                <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:grid">
                  <span>Template</span>
                  <span className="text-right">Sent</span>
                  <span className="text-right">Delivered</span>
                  <span className="text-right">Read Rate</span>
                  <span className="text-right">Replied</span>
                  <span className="text-right">Failed</span>
                  <span />
                </div>

                <div className="divide-y divide-slate-100">
                  {templatePerformance.map((row, idx) => {
                    const isExpanded = expandedTemplate === row.template
                    const isLoadingThis = templateLoading === row.template
                    const recData = templateRecipients[row.template]
                    const replyCount = recData?.summary.replied ?? 0
                    const replyRate = recData ? (replyCount / (recData.summary.total || 1)) * 100 : null
                    const isTopPerformer = idx === 0 && row.readRate > 0
                    const isLowPerformer = row.readRate < 20 && row.effectiveSent > 10

                    return (
                      <div key={row.template}>
                        <div className={`grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] sm:gap-4 sm:items-center ${isTopPerformer ? 'bg-emerald-50/30' : isLowPerformer ? 'bg-rose-50/20' : ''}`}>
                          {/* Template name */}
                          <div className="flex items-center gap-2 min-w-0">
                            {isTopPerformer && (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">★</span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900 text-sm">{row.template}</p>
                              {/* Mobile metrics */}
                              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 sm:hidden">
                                <span>Sent: <strong>{formatInt(row.effectiveSent)}</strong></span>
                                <span className={row.readRate >= 40 ? 'text-sky-700 font-semibold' : row.readRate >= 20 ? 'text-amber-700' : 'text-rose-700'}>
                                  Read: <strong>{formatPct(row.readRate)}</strong>
                                </span>
                                {row.failed > 0 && <span className="text-rose-600">Failed: <strong>{formatInt(row.failed)}</strong></span>}
                              </div>
                              {/* Delivery bar */}
                              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full bg-sky-400" style={{ width: `${Math.min(100, row.readRate)}%` }} />
                                <div className="h-full bg-teal-300" style={{ width: `${Math.min(100, Math.max(0, row.deliveryRate - row.readRate))}%` }} />
                                {row.failed > 0 && <div className="ml-auto h-full bg-rose-400" style={{ width: `${Math.min(100, row.failRate)}%` }} />}
                              </div>
                            </div>
                          </div>

                          {/* Sent */}
                          <div className="hidden sm:block text-right">
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatInt(row.effectiveSent)}</span>
                          </div>

                          {/* Delivered % */}
                          <div className="hidden sm:block text-right">
                            <span className={`text-sm font-semibold tabular-nums ${row.deliveryRate >= 85 ? 'text-teal-700' : row.deliveryRate >= 60 ? 'text-amber-700' : 'text-rose-700'}`}>
                              {formatPct(row.deliveryRate)}
                            </span>
                          </div>

                          {/* Read Rate */}
                          <div className="hidden sm:block text-right">
                            <span className={`text-sm font-bold tabular-nums ${row.readRate >= 50 ? 'text-sky-700' : row.readRate >= 25 ? 'text-amber-700' : 'text-rose-600'}`}>
                              {formatPct(row.readRate)}
                            </span>
                          </div>

                          {/* Replied */}
                          <div className="hidden sm:block text-right">
                            <span className="text-sm font-semibold text-violet-700 tabular-nums">
                              {recData ? formatInt(replyCount) : '—'}
                            </span>
                            {replyRate !== null && replyRate > 0 && (
                              <p className="text-[10px] text-slate-400">{formatPct(replyRate)}</p>
                            )}
                          </div>

                          {/* Failed */}
                          <div className="hidden sm:block text-right">
                            <span className={`text-sm font-semibold tabular-nums ${row.failed > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                              {row.failed > 0 ? formatInt(row.failed) : '—'}
                            </span>
                          </div>

                          {/* Expand button */}
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => toggleTemplate(row.template)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {isExpanded ? 'Hide' : 'Recipients'}
                            </button>
                          </div>
                        </div>

                        {/* Expanded recipient table */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/60">
                            {isLoadingThis ? (
                              <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading recipients…
                              </div>
                            ) : !recData ? (
                              <div className="px-5 py-6 text-sm text-slate-500">No CRM recipient data for this template.</div>
                            ) : (
                              <>
                                {/* Filter tabs */}
                                {(() => {
                                  const active = templateRecipientFilter[row.template] ?? 'all'
                                  const set = (v: typeof active) => setTemplateRecipientFilter((prev) => ({ ...prev, [row.template]: v }))
                                  const tabs: Array<{ label: string; value: number; filter: typeof active; color: string }> = [
                                    { label: 'All', value: recData.summary.total, filter: 'all', color: 'text-slate-900' },
                                    { label: 'Read', value: recData.summary.read, filter: 'read', color: 'text-sky-700' },
                                    { label: 'Delivered', value: recData.summary.delivered, filter: 'delivered', color: 'text-teal-700' },
                                    { label: 'Sent', value: recData.summary.sent, filter: 'sent', color: 'text-emerald-700' },
                                    { label: 'Replied', value: recData.summary.replied, filter: 'replied', color: 'text-violet-700' },
                                    { label: 'Failed', value: recData.summary.failed, filter: 'failed', color: 'text-rose-700' },
                                  ]
                                  return (
                                    <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-4 py-2">
                                      {tabs.map((tab) => (
                                        <button key={tab.filter} type="button" onClick={() => set(tab.filter)}
                                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${active === tab.filter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                          {tab.label} <span className={active === tab.filter ? 'opacity-70' : tab.color}>({formatInt(tab.value)})</span>
                                        </button>
                                      ))}
                                    </div>
                                  )
                                })()}

                                <div className="max-h-80 overflow-y-auto">
                                  <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-10">
                                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                                        <th className="px-4 py-2.5">Name</th>
                                        <th className="px-4 py-2.5">Phone</th>
                                        <th className="px-4 py-2.5">Status</th>
                                        <th className="px-4 py-2.5">Sent At</th>
                                        <th className="px-4 py-2.5 text-center">Replied</th>
                                        <th className="px-4 py-2.5 text-center">Chat</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {(() => {
                                        const active = templateRecipientFilter[row.template] ?? 'all'
                                        const recipients =
                                          active === 'all' ? recData.recipients
                                            : active === 'replied' ? recData.recipients.filter((r) => r.replied)
                                              : recData.recipients.filter((r) => r.status === active)
                                        if (recipients.length === 0) {
                                          return (
                                            <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">No recipients in this filter.</td></tr>
                                          )
                                        }
                                        return recipients.map((r, i) => (
                                          <tr key={i} className={`transition hover:bg-slate-50/80 ${r.status === 'failed' ? 'bg-rose-50/40' : ''}`}>
                                            <td className="px-4 py-2.5">
                                              <span className="flex items-center gap-1.5 font-medium text-slate-800">
                                                <User className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                                {r.lead_name || '—'}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.phone}</td>
                                            <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                                            <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                                              {new Date(r.sent_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                              {r.replied
                                                ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Reply className="h-3 w-3" /></span>
                                                : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                              <Link href={inboxUrl(r.phone, r.lead_id, r.lead_name)}
                                                className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#128C7E] transition hover:bg-[#25D366]/20">
                                                <ExternalLink className="h-3 w-3" /> Open
                                              </Link>
                                            </td>
                                          </tr>
                                        ))
                                      })()}
                                    </tbody>
                                  </table>
                                </div>
                                {recData.recipients.length >= 200 && (
                                  <p className="px-4 py-2 text-center text-xs text-amber-700">Showing first 200 recipients. Narrow the date range to see more.</p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4 — CAMPAIGN PERFORMANCE TABLE
          ══════════════════════════════════════════════════════════════ */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Megaphone className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Broadcast Campaigns</h2>
                <p className="text-xs text-slate-500">Per-campaign results — sent, failed, reply rate</p>
              </div>
            </div>

            {/* Campaign summary bar */}
            {campaignMetrics && campaigns.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Campaigns</p>
                  <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{formatInt(campaignMetrics.totalCampaigns)}</p>
                  <p className="text-[11px] text-slate-500">{formatInt(campaignMetrics.completedCampaigns)} completed</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total Recipients</p>
                  <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{formatInt(campaignMetrics.totalRecipients)}</p>
                  <p className="text-[11px] text-slate-500">{formatInt(campaignMetrics.totalFailed)} failed</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3.5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500">Total Replies</p>
                  <p className="mt-1 text-xl font-bold text-violet-900 tabular-nums">{formatInt(campaignMetrics.totalReplied)}</p>
                  <p className="text-[11px] text-violet-600">avg {formatPct(campaignMetrics.avgReplyRate)} reply rate</p>
                </div>
                {campaignMetrics.best && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Best Campaign</p>
                    <p className="mt-1 truncate text-sm font-bold text-amber-900">{campaignMetrics.best.templateName}</p>
                    <p className="text-[11px] text-amber-700">{formatPct(campaignMetrics.best.replyRate)} reply rate</p>
                  </div>
                )}
              </div>
            )}

            {campaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center text-sm text-slate-500">
                No campaigns in this period.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* Table header */}
                <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:grid">
                  <span>Template · Date</span>
                  <span className="text-right">Recipients</span>
                  <span className="text-right">Sent</span>
                  <span className="text-right">Failed</span>
                  <span className="text-right">Replied</span>
                  <span className="text-right">Reply Rate</span>
                  <span className="text-right">Status</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {campaigns.map((c) => {
                    const expanded = expandedCampaignId === c.id
                    const replyRate = c.sent > 0 ? (c.repliedCount / c.sent) * 100 : 0
                    return (
                      <div key={c.id}>
                        <button type="button" onClick={() => toggleCampaign(c)}
                          className="grid w-full grid-cols-1 gap-2 px-5 py-3.5 text-left transition hover:bg-slate-50 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] sm:items-center sm:gap-4">
                          {/* Template + date */}
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                              <span className="truncate font-semibold text-slate-900 text-sm">{c.templateName}</span>
                            </span>
                            <span className="ml-5 block text-[11px] text-slate-400">
                              {new Date(c.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {/* Mobile stats */}
                            <div className="ml-5 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] sm:hidden">
                              <span className="text-slate-600">{formatInt(c.recipientCount)} recipients</span>
                              <span className="text-emerald-700">{formatInt(c.sent)} sent</span>
                              {c.failed > 0 && <span className="text-rose-700">{formatInt(c.failed)} failed</span>}
                              <span className="text-violet-700">{formatInt(c.repliedCount)} replied ({formatPct(replyRate)})</span>
                            </div>
                          </span>
                          <span className="hidden text-right text-sm font-semibold text-slate-700 tabular-nums sm:block">{formatInt(c.recipientCount)}</span>
                          <span className="hidden text-right text-sm font-semibold text-emerald-700 tabular-nums sm:block">{formatInt(c.sent)}</span>
                          <span className={`hidden text-right text-sm font-semibold tabular-nums sm:block ${c.failed > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                            {c.failed > 0 ? formatInt(c.failed) : '—'}
                          </span>
                          <span className="hidden text-right text-sm font-semibold text-violet-700 tabular-nums sm:block">{formatInt(c.repliedCount)}</span>
                          <span className={`hidden text-right text-sm font-bold tabular-nums sm:block ${replyRate >= 10 ? 'text-emerald-700' : replyRate >= 3 ? 'text-amber-700' : 'text-slate-500'}`}>
                            {c.sent > 0 ? formatPct(replyRate) : '—'}
                          </span>
                          <span className="hidden sm:flex justify-end"><StatusBadge status={c.status} /></span>
                        </button>

                        {/* Campaign detail */}
                        {expanded && (
                          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                            {campaignDetailLoading ? (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                              </div>
                            ) : !campaignDetail || campaignDetail.id !== c.id ? (
                              <p className="text-sm text-slate-500">No detail available.</p>
                            ) : (
                              <div className="grid gap-6 lg:grid-cols-2">
                                {/* Replied */}
                                <div>
                                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                                    <Reply className="h-3.5 w-3.5" /> Replied ({formatInt(campaignDetail.repliedRecipients.length)})
                                  </p>
                                  {campaignDetail.repliedRecipients.length === 0 ? (
                                    <p className="text-sm text-slate-500">No replies recorded.</p>
                                  ) : (
                                    <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-sm">
                                      {campaignDetail.repliedRecipients.map((r, i) => (
                                        <li key={i} className="flex flex-col gap-0.5 border-b border-slate-50 pb-2 last:border-0">
                                          <span className="flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-1.5 truncate font-medium text-slate-800">
                                              <User className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                              {r.name || '—'}
                                            </span>
                                            <span className="flex items-center gap-2 shrink-0">
                                              <span className="font-mono text-xs text-slate-400">{r.phone}</span>
                                              <Link href={inboxUrl(r.phone, null, r.name)} className="inline-flex items-center gap-0.5 rounded bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#128C7E] hover:bg-[#25D366]/20">
                                                <ExternalLink className="h-2.5 w-2.5" /> Chat
                                              </Link>
                                            </span>
                                          </span>
                                          <span className="text-[11px] text-slate-400">
                                            {new Date(r.firstReplyAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                          <span className="text-xs text-slate-600 italic">&ldquo;{r.preview}&rdquo;</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                                {/* Failed */}
                                <div>
                                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-700">
                                    <XCircle className="h-3.5 w-3.5" /> Failed ({formatInt(campaignDetail.failedRecipients.length)})
                                  </p>
                                  {campaignDetail.failedRecipients.length === 0 ? (
                                    <p className="text-sm text-slate-500">No failures recorded.</p>
                                  ) : (
                                    <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-sm">
                                      {campaignDetail.failedRecipients.map((f, i) => (
                                        <li key={i} className="flex flex-col gap-0.5 border-b border-slate-50 pb-2 last:border-0">
                                          <span className="flex items-center justify-between gap-2">
                                            <span className="truncate font-medium text-slate-800">{f.name || '—'}</span>
                                            <span className="flex items-center gap-2 shrink-0">
                                              <span className="font-mono text-xs text-slate-400">{f.phone}</span>
                                              <Link href={inboxUrl(f.phone, null, f.name)} className="inline-flex items-center gap-0.5 rounded bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#128C7E] hover:bg-[#25D366]/20">
                                                <ExternalLink className="h-2.5 w-2.5" /> Chat
                                              </Link>
                                            </span>
                                          </span>
                                          <span className="text-xs text-rose-600">{f.error}</span>
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
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 5 — ACTIVITY TREND (sent vs replies over time)
          ══════════════════════════════════════════════════════════════ */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Activity Trend</h2>
                <p className="text-xs text-slate-500">Daily outbound messages vs inbound replies — spot engagement patterns</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-100">
              {messagesOverTimeChart.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={messagesOverTimeChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={WA_GREEN} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={WA_GREEN} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradRecv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip
                        labelFormatter={(_, payload) => {
                          const raw = payload?.[0]?.payload?.date as string | undefined
                          return raw ? new Date(raw + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''
                        }}
                        formatter={(value, name) => [formatInt(Number(value ?? 0)), name === 'sent' ? 'Sent' : 'Replies']}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 30px -8px rgb(0 0 0 / 0.15)' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} formatter={(v) => v === 'sent' ? 'Sent' : 'Replies'} />
                      <Area type="monotone" dataKey="sent" stroke={WA_GREEN} strokeWidth={2} fill="url(#gradSent)" name="sent" />
                      <Area type="monotone" dataKey="received" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradRecv)" name="received" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">No data in this period</p>
              )}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 6 — AUDIENCE HEALTH (delivery by lead)
          ══════════════════════════════════════════════════════════════ */}
          {deliveryStatus && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Audience Health</h2>
                  <p className="text-xs text-slate-500">Distinct leads by latest delivery status — identify who to follow up with</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-100">
                {/* Summary with visual bar */}
                {(() => {
                  const s = deliveryStatus.summary
                  const total = s.read + s.delivered + s.sent + s.failed + s.pending || 1
                  return (
                    <>
                      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                        {[
                          { key: 'read', label: 'Read', color: 'border-sky-200 bg-sky-50 text-sky-900', bar: 'bg-sky-400' },
                          { key: 'delivered', label: 'Delivered', color: 'border-teal-200 bg-teal-50 text-teal-900', bar: 'bg-teal-400' },
                          { key: 'sent', label: 'Sent', color: 'border-emerald-200 bg-emerald-50 text-emerald-900', bar: 'bg-emerald-400' },
                          { key: 'failed', label: 'Failed', color: 'border-rose-200 bg-rose-50 text-rose-900', bar: 'bg-rose-400' },
                          { key: 'pending', label: 'Pending', color: 'border-amber-200 bg-amber-50 text-amber-900', bar: 'bg-amber-400' },
                        ].map(({ key, label, color }) => (
                          <div key={key} className={`rounded-xl border p-3 ${color}`}>
                            <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{label}</p>
                            <p className="mt-1 text-xl font-bold tabular-nums">
                              {formatInt(s[key as keyof typeof s] as number)}
                            </p>
                            <p className="text-[10px] opacity-50">
                              {formatPct((s[key as keyof typeof s] as number / total) * 100)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-sky-400" style={{ width: `${(s.read / total) * 100}%` }} />
                        <div className="h-full bg-teal-400" style={{ width: `${(s.delivered / total) * 100}%` }} />
                        <div className="h-full bg-emerald-400" style={{ width: `${(s.sent / total) * 100}%` }} />
                        <div className="h-full bg-amber-400" style={{ width: `${(s.pending / total) * 100}%` }} />
                        <div className="h-full bg-rose-400" style={{ width: `${(s.failed / total) * 100}%` }} />
                      </div>
                    </>
                  )
                })()}

                {/* Expandable groups — failed first (most actionable) */}
                <div className="space-y-2">
                  {[
                    { key: 'failed', label: 'Failed — check phone numbers or opt-out status', accent: 'text-rose-700 bg-rose-50 border-rose-200' },
                    { key: 'sent', label: 'Sent (awaiting delivery confirmation)', accent: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    { key: 'delivered', label: 'Delivered — not yet read', accent: 'text-teal-700 bg-teal-50 border-teal-200' },
                    { key: 'read', label: 'Read — message opened', accent: 'text-sky-700 bg-sky-50 border-sky-200' },
                    { key: 'pending', label: 'Pending — in queue', accent: 'text-amber-700 bg-amber-50 border-amber-200' },
                  ].map(({ key, label, accent }) => {
                    const isExp = expandedStatus === key
                    const items = deliveryStatus.byStatus[key]?.items ?? []
                    const count = deliveryStatus.summary[key as keyof typeof deliveryStatus.summary] as number
                    if (count === 0) return null
                    return (
                      <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <button type="button" onClick={() => setExpandedStatus(isExp ? null : key)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50">
                          <span className="flex items-center gap-2 text-sm text-slate-700">
                            {isExp ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                            {label}
                          </span>
                          <span className={`rounded-full border px-3 py-0.5 text-sm font-bold tabular-nums ${accent}`}>{formatInt(count)}</span>
                        </button>
                        {isExp && items.length > 0 && (
                          <div className="max-h-60 overflow-y-auto border-t border-slate-100">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  <th className="px-4 py-2">Name</th>
                                  <th className="px-4 py-2">Phone</th>
                                  <th className="px-4 py-2 text-center">Chat</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {items.map((item, i) => (
                                  <tr key={i} className="transition hover:bg-slate-50/80">
                                    <td className="px-4 py-2.5 font-medium text-slate-800">{item.lead_name || '—'}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.phone}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <Link href={inboxUrl(item.phone, item.lead_id, item.lead_name)}
                                        className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#128C7E] transition hover:bg-[#25D366]/20">
                                        <ExternalLink className="h-3 w-3" /> Open
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {deliveryStatus.summary.failed > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <Link href="/marketing/bulk-whatsapp?retry=failed"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#20BA5A]">
                      <RotateCcw className="h-4 w-4" />
                      Retry {formatInt(deliveryStatus.summary.failed)} failed recipients
                    </Link>
                    <p className="mt-1.5 text-xs text-slate-500">Opens Bulk WhatsApp with failed numbers pre-filled.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-center text-xs text-slate-400">
            {metrics.source === 'meta'
              ? <><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-500" /><strong className="text-slate-600">Meta Verified</strong> — data from Meta Business API · CRM data from <code className="rounded bg-slate-100 px-1 text-slate-500">whatsapp_messages</code></>
              : <><Activity className="mr-1 inline h-3.5 w-3.5" /><strong className="text-slate-600">CRM data</strong> from <code className="rounded bg-slate-100 px-1">whatsapp_messages</code> & <code className="rounded bg-slate-100 px-1">scheduled_broadcasts</code> · <Link href="/marketing/whatsapp" className="underline hover:text-slate-600">Connect Meta API</Link> for verified numbers</>
            }
          </div>
        </>
      )}
    </div>
  )
}
