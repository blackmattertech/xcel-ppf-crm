'use client'

import { useState, useEffect, useMemo, useRef, type ComponentType } from 'react'
import Link from 'next/link'
import {
  Loader2,
  Send,
  Inbox,
  BarChart2,
  FileText,
  Calendar,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Activity,
  Zap,
  Target,
  Megaphone,
  User,
  ExternalLink,
  CheckCheck,
  XCircle,
  Reply,
  MousePointerClick,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import {
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

const STATUS_COLORS: Record<string, string> = {
  sent: '#25D366',
  delivered: '#128C7E',
  read: '#34B7F1',
  pending: '#f59e0b',
  failed: '#ef4444',
}

const STATUS_RANK: Record<string, number> = { read: 5, delivered: 4, sent: 3, pending: 2, failed: 1 }

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

// Meta official API types
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
  if (!Number.isFinite(n)) return '—'
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
  }
  const c = config[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.className}`}>
      {c.label}
    </span>
  )
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
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${rings[accent]} p-4 ring-1 shadow-sm backdrop-blur-sm transition hover:shadow-md`}>
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

// ─── main page ───────────────────────────────────────────────────────────────

export default function WhatsAppAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<WhatsAppAnalyticsData | null>(null)
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusResponse | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignSummaryRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // Meta official analytics
  const [metaAnalytics, setMetaAnalytics] = useState<MetaAnalyticsResponse | MetaAnalyticsError | null>(null)
  const [expandedMetaTemplate, setExpandedMetaTemplate] = useState<string | null>(null)

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

  const periodDays = useMemo(() => {
    const ms = new Date(committedRange.end).getTime() - new Date(committedRange.start).getTime()
    return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
  }, [committedRange])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setExpandedTemplate(null)
    setTemplateRecipients({})
    setExpandedMetaTemplate(null)
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
      // Meta official analytics — never throws, returns unavailable on error
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

  const toggleMetaTemplate = async (templateName: string) => {
    if (expandedMetaTemplate === templateName) { setExpandedMetaTemplate(null); return }
    setExpandedMetaTemplate(templateName)
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

  const toggleTemplate = async (templateName: string) => {
    if (expandedTemplate === templateName) { setExpandedTemplate(null); return }
    setExpandedTemplate(templateName)
    setTemplateRecipientFilter((prev) => (prev[templateName] ? prev : { ...prev, [templateName]: 'all' }))
    if (templateRecipients[templateName]) return // already loaded
    setTemplateLoading(templateName)
    try {
      const { start, end } = committedRange
      const res = await fetch(
        `/api/marketing/whatsapp/template-recipients?templateName=${encodeURIComponent(templateName)}&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
        { credentials: 'include' }
      )
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        setTemplateRecipients((prev) => ({ ...prev, [templateName]: j }))
      }
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

  const derivedMetrics = useMemo(() => {
    if (!data) return null
    const out = data.totals.sent
    const read = data.messagesByStatus.read ?? 0
    const delivered = data.messagesByStatus.delivered ?? 0
    const failed = data.messagesByStatus.failed ?? 0
    const readRate = out > 0 ? (read / out) * 100 : 0
    const deliverRate = out > 0 ? ((delivered + read) / out) * 100 : 0
    const avgPerDay = periodDays > 0 ? data.totals.total / periodDays : 0
    let peakDay = { date: '', total: 0 }
    for (const d of data.messagesOverTime) { if (d.total > peakDay.total) peakDay = { date: d.date, total: d.total } }
    const activeDays = data.messagesOverTime.filter((d) => d.total > 0).length
    const templateCount = data.messagesByTemplate.length
    const totalTemplSends = data.messagesByTemplate.reduce((s, t) => s + t.count, 0)
    return { readRate, deliverRate, avgPerDay, peakDay, activeDays, templateCount, totalTemplSends, failedOutgoing: failed }
  }, [data, periodDays])

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
    <div className="space-y-8 pb-10">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#25D366]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Link href="/marketing/whatsapp" className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white backdrop-blur-sm transition hover:bg-white/20">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90">Insights</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">WhatsApp Analytics</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Template performance, delivery funnel, per-recipient status and replies — everything to run effective campaigns.
              </p>
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                <Calendar className="h-3.5 w-3.5 text-emerald-300" />
                {new Date(committedRange.start).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                {' – '}
                {new Date(committedRange.end).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
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

      {/* ── Meta Official Analytics ── */}
      {metaAnalytics && (
        <section className="space-y-4">
          {/* Section header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">Meta Official Insights</span>
            </div>
            <span className="text-xs text-slate-400">Numbers sourced directly from Meta&apos;s Business API — most accurate</span>
          </div>

          {metaAnalytics.source === 'unavailable' ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">Meta API not available</p>
                <p className="mt-0.5 text-sm text-amber-800">{(metaAnalytics as MetaAnalyticsError).reason}</p>
                <p className="mt-1 text-xs text-amber-700">
                  CRM data (parsed from message body) is shown below. To enable Meta Insights, configure your WABA ID and Access Token in{' '}
                  <Link href="/marketing/whatsapp" className="underline">WhatsApp settings</Link>.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Overall Meta KPIs */}
              {(() => {
                const m = metaAnalytics as MetaAnalyticsResponse
                const totalSent = m.overall.sent || m.templates.reduce((s, t) => s + t.sent, 0)
                const totalDelivered = m.overall.delivered || m.templates.reduce((s, t) => s + t.delivered, 0)
                const totalRead = m.templates.reduce((s, t) => s + t.read, 0)
                const totalClicked = m.templates.reduce((s, t) => s + t.clicked, 0)
                const totalFailed = m.templates.reduce((s, t) => s + t.failed, 0)
                const readRate = totalSent > 0 ? (totalRead / totalSent) * 100 : 0
                const deliverRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0
                return (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                      { label: 'Sent', value: formatInt(totalSent), sub: 'Accepted by Meta', color: 'bg-emerald-50 border-emerald-200 text-emerald-950', badge: 'text-emerald-600' },
                      { label: 'Delivered', value: formatInt(totalDelivered), sub: formatPct(deliverRate) + ' of sent', color: 'bg-teal-50 border-teal-200 text-teal-950', badge: 'text-teal-600' },
                      { label: 'Read', value: formatInt(totalRead), sub: formatPct(readRate) + ' read rate', color: 'bg-sky-50 border-sky-200 text-sky-950', badge: 'text-sky-600' },
                      { label: 'Clicked', value: formatInt(totalClicked), sub: 'Button interactions', color: 'bg-violet-50 border-violet-200 text-violet-950', badge: 'text-violet-600' },
                      { label: 'Failed', value: formatInt(totalFailed), sub: 'Delivery errors (CRM)', color: 'bg-rose-50 border-rose-200 text-rose-950', badge: 'text-rose-600' },
                    ].map((card) => (
                      <div key={card.label} className={`rounded-2xl border p-4 ${card.color}`}>
                        <p className={`text-xs font-bold uppercase tracking-wide opacity-60`}>{card.label}</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
                        <p className="mt-0.5 text-[11px] opacity-60">{card.sub}</p>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Per-template Meta table */}
              {(metaAnalytics as MetaAnalyticsResponse).templates.length > 0 ? (
                <div className="space-y-2">
                  {(metaAnalytics as MetaAnalyticsResponse).templates.map((t) => {
                    const isExpanded = expandedMetaTemplate === t.templateName
                    const isLoadingThis = templateLoading === t.templateName
                    const recData = templateRecipients[t.templateName]

                    return (
                      <div key={t.templateId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {/* Row */}
                        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-900">{t.templateName}</span>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 border border-emerald-200">
                                Meta verified
                              </span>
                            </div>
                            {/* Progress bar: read / delivered / sent */}
                            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full bg-sky-400" style={{ width: `${Math.min(100, t.readRate)}%` }} />
                              <div className="h-full bg-teal-400" style={{ width: `${Math.min(100, t.deliverRate - t.readRate)}%` }} />
                              {t.failed > 0 && (
                                <div className="ml-auto h-full bg-rose-400" style={{ width: `${Math.min(100, (t.failed / (t.sent || 1)) * 100)}%` }} />
                              )}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" />Read {formatPct(t.readRate)}</span>
                              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400" />Delivered {formatPct(t.deliverRate)}</span>
                              {t.clicked > 0 && <span className="flex items-center gap-1 text-violet-600"><MousePointerClick className="h-3 w-3" />{formatInt(t.clicked)} clicked</span>}
                              {t.failed > 0 && <span className="flex items-center gap-1 text-rose-600"><XCircle className="h-3 w-3" />{formatInt(t.failed)} failed</span>}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5 shrink-0 sm:justify-end">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              <Send className="h-3 w-3" />{formatInt(t.sent)} Sent
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                              <CheckCheck className="h-3 w-3" />{formatInt(t.delivered)} Delivered
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                              <CheckCheck className="h-3 w-3" />{formatInt(t.read)} Read
                            </span>
                            {t.clicked > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                                <MousePointerClick className="h-3 w-3" />{formatInt(t.clicked)} Clicked
                              </span>
                            )}
                            {recData && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                                <Reply className="h-3 w-3" />{formatInt(recData.summary.replied)} Replied
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleMetaTemplate(t.templateName)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {isExpanded ? 'Hide' : 'View'} recipients
                            </button>
                          </div>
                        </div>

                        {/* Click breakdown (if any) */}
                        {t.clickDetails.length > 0 && (
                          <div className="border-t border-slate-100 bg-violet-50/40 px-5 py-2 flex flex-wrap gap-2">
                            <span className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide mr-1">Button clicks:</span>
                            {t.clickDetails.map((c, i) => (
                              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[11px] text-violet-800">
                                <MousePointerClick className="h-3 w-3" />
                                {c.button_content} ({c.type.replace('_', ' ')}): <strong>{formatInt(c.count)}</strong>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Expanded recipient list */}
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
                                {(() => {
                                  const active = templateRecipientFilter[t.templateName] ?? 'all'
                                  const set = (v: typeof active) => setTemplateRecipientFilter((prev) => ({ ...prev, [t.templateName]: v }))
                                  const metrics: Array<{ label: string; value: number; color: string; filter: typeof active }> = [
                                    { label: 'Total', value: recData.summary.total, color: 'text-slate-900', filter: 'all' },
                                    { label: 'Sent', value: recData.summary.sent, color: 'text-emerald-700', filter: 'sent' },
                                    { label: 'Delivered', value: recData.summary.delivered, color: 'text-teal-700', filter: 'delivered' },
                                    { label: 'Read', value: recData.summary.read, color: 'text-sky-700', filter: 'read' },
                                    { label: 'Failed', value: recData.summary.failed, color: 'text-rose-700', filter: 'failed' },
                                    { label: 'Replied', value: recData.summary.replied, color: 'text-violet-700', filter: 'replied' },
                                  ]

                                  return (
                                    <div className="grid grid-cols-3 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-6">
                                      {metrics.map((m) => {
                                        const isActive = active === m.filter
                                        return (
                                          <button
                                            key={m.label}
                                            type="button"
                                            aria-pressed={isActive}
                                            onClick={() => set(m.filter)}
                                            className={`flex flex-col items-center bg-white px-3 py-2.5 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${isActive ? 'ring-2 ring-inset ring-slate-900/10' : ''}`}
                                            title={`Show ${m.label.toLowerCase()} recipients`}
                                          >
                                            <span className={`text-lg font-bold tabular-nums ${m.color}`}>{formatInt(m.value)}</span>
                                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${isActive ? 'text-slate-700' : 'text-slate-400'}`}>{m.label}</span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )
                                })()}
                                <div className="max-h-96 overflow-y-auto">
                                  <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-10">
                                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                                        <th className="px-4 py-2.5">Name</th>
                                        <th className="px-4 py-2.5">Phone</th>
                                        <th className="px-4 py-2.5">Status</th>
                                        <th className="px-4 py-2.5">Sent at</th>
                                        <th className="px-4 py-2.5 text-center">Replied</th>
                                        <th className="px-4 py-2.5 text-center">Inbox</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {(() => {
                                        const active = templateRecipientFilter[t.templateName] ?? 'all'
                                        const recipients =
                                          active === 'all'
                                            ? recData.recipients
                                            : active === 'replied'
                                              ? recData.recipients.filter((r) => r.replied)
                                              : recData.recipients.filter((r) => r.status === active)

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
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center text-sm text-slate-500">
                  No template analytics returned by Meta for this period.
                </div>
              )}
            </>
          )}
        </section>
      )}

      {data && derivedMetrics && (
        <>
          {/* ── KPI Grid ── */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <KpiCard icon={Send} label="Total Sent" value={formatInt(data.totals.sent)} sub={`${formatInt(derivedMetrics.activeDays)} active days`} accent="green" />
            <KpiCard icon={CheckCheck} label="Delivered + Read" value={formatInt((data.messagesByStatus.delivered ?? 0) + (data.messagesByStatus.read ?? 0))} sub={formatPct(derivedMetrics.deliverRate) + ' of sent'} accent="teal" />
            <KpiCard icon={Target} label="Read Rate" value={formatPct(derivedMetrics.readRate)} sub={`${formatInt(data.messagesByStatus.read ?? 0)} messages read`} accent="blue" />
            <KpiCard icon={XCircle} label="Failed" value={formatInt(derivedMetrics.failedOutgoing)} sub="Delivery errors" accent="rose" />
            <KpiCard icon={Inbox} label="Replies Received" value={formatInt(data.totals.received)} sub="Inbound messages" accent="violet" />
            <KpiCard icon={FileText} label="Templates Used" value={formatInt(derivedMetrics.templateCount)} sub={`${formatInt(derivedMetrics.totalTemplSends)} total sends`} accent="amber" />
            <KpiCard icon={Zap} label="Busiest Day" value={derivedMetrics.peakDay.total > 0 ? formatInt(derivedMetrics.peakDay.total) : '—'} sub={derivedMetrics.peakDay.date ? new Date(derivedMetrics.peakDay.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No data'} accent="amber" />
            <KpiCard icon={Activity} label="Avg / Day" value={derivedMetrics.avgPerDay < 10 ? derivedMetrics.avgPerDay.toFixed(1) : formatInt(Math.round(derivedMetrics.avgPerDay))} sub="Messages per day" accent="slate" />
          </section>

          {/* ── Template Metrics (main section) ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <FileText className="h-4 w-4" />
                  </span>
                  Template Metrics
                </h2>
                <p className="mt-0.5 pl-10 text-xs text-slate-500">
                  Per-template delivery: sent, delivered, read, failed, replied. Expand to see every recipient.
                </p>
              </div>
            </div>

            {(data.templateDeliveryStats?.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-12 text-center text-sm text-slate-500">
                No template sends in this period.
              </div>
            ) : (
              <div className="space-y-2">
                {data.templateDeliveryStats.map((row) => {
                  const isExpanded = expandedTemplate === row.template
                  const isLoadingThis = templateLoading === row.template
                  const recData = templateRecipients[row.template]
                  const total = row.total || 1
                  const readRate = ((row.read / total) * 100)
                  const deliverRate = (((row.delivered + row.read) / total) * 100)

                  return (
                    <div key={row.template} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      {/* Template header row */}
                      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 truncate">{row.template}</span>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {formatInt(row.total)} total
                            </span>
                          </div>
                          {/* Delivery progress bar */}
                          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.min(100, readRate)}%` }} title={`Read: ${formatPct(readRate)}`} />
                            <div className="h-full bg-teal-400 transition-all" style={{ width: `${Math.min(100, deliverRate - readRate)}%` }} title={`Delivered: ${formatPct(deliverRate - readRate)}`} />
                            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.min(100, ((row.sent / total) * 100))}%` }} />
                            {row.failed > 0 && (
                              <div className="h-full bg-rose-400 transition-all ml-auto" style={{ width: `${Math.min(100, (row.failed / total) * 100)}%` }} />
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" />Read {formatPct(readRate)}</span>
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400" />Delivered {formatPct(deliverRate)}</span>
                            {row.failed > 0 && <span className="flex items-center gap-1 text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-400" />Failed {formatInt(row.failed)}</span>}
                          </div>
                        </div>

                        {/* Metric pills */}
                        <div className="flex flex-wrap gap-1.5 shrink-0 sm:justify-end">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            <Send className="h-3 w-3" />{formatInt(row.sent + row.delivered + row.read)} Sent
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                            <CheckCheck className="h-3 w-3" />{formatInt(row.read)} Read
                          </span>
                          {row.failed > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                              <XCircle className="h-3 w-3" />{formatInt(row.failed)} Failed
                            </span>
                          )}
                          {recData && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                              <Reply className="h-3 w-3" />{formatInt(recData.summary.replied)} Replied
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleTemplate(row.template)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {isExpanded ? 'Hide' : 'View'} recipients
                          </button>
                        </div>
                      </div>

                      {/* Expanded recipient list */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/60">
                          {isLoadingThis ? (
                            <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading recipients…
                            </div>
                          ) : !recData ? (
                            <div className="px-5 py-6 text-sm text-slate-500">No recipient data.</div>
                          ) : (
                            <>
                              {/* Recipient summary bar */}
                              {(() => {
                                const active = templateRecipientFilter[row.template] ?? 'all'
                                const set = (v: typeof active) => setTemplateRecipientFilter((prev) => ({ ...prev, [row.template]: v }))
                                const metrics: Array<{ label: string; value: number; color: string; filter: typeof active }> = [
                                  { label: 'Total', value: recData.summary.total, color: 'text-slate-900', filter: 'all' },
                                  { label: 'Sent', value: recData.summary.sent, color: 'text-emerald-700', filter: 'sent' },
                                  { label: 'Delivered', value: recData.summary.delivered, color: 'text-teal-700', filter: 'delivered' },
                                  { label: 'Read', value: recData.summary.read, color: 'text-sky-700', filter: 'read' },
                                  { label: 'Failed', value: recData.summary.failed, color: 'text-rose-700', filter: 'failed' },
                                  { label: 'Replied', value: recData.summary.replied, color: 'text-violet-700', filter: 'replied' },
                                ]

                                return (
                                  <div className="grid grid-cols-3 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-6">
                                    {metrics.map((m) => {
                                      const isActive = active === m.filter
                                      return (
                                        <button
                                          key={m.label}
                                          type="button"
                                          aria-pressed={isActive}
                                          onClick={() => set(m.filter)}
                                          className={`flex flex-col items-center bg-white px-3 py-2.5 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${isActive ? 'ring-2 ring-inset ring-slate-900/10' : ''}`}
                                          title={`Show ${m.label.toLowerCase()} recipients`}
                                        >
                                          <span className={`text-lg font-bold tabular-nums ${m.color}`}>{formatInt(m.value)}</span>
                                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${isActive ? 'text-slate-700' : 'text-slate-400'}`}>{m.label}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                )
                              })()}

                              {/* Recipient table */}
                              <div className="max-h-96 overflow-y-auto">
                                <table className="w-full text-sm">
                                  <thead className="sticky top-0 z-10">
                                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                                      <th className="px-4 py-2.5">Name</th>
                                      <th className="px-4 py-2.5">Phone</th>
                                      <th className="px-4 py-2.5">Status</th>
                                      <th className="px-4 py-2.5">Sent at</th>
                                      <th className="px-4 py-2.5 text-center">Replied</th>
                                      <th className="px-4 py-2.5 text-center">Inbox</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {(() => {
                                      const active = templateRecipientFilter[row.template] ?? 'all'
                                      const recipients =
                                        active === 'all'
                                          ? recData.recipients
                                          : active === 'replied'
                                            ? recData.recipients.filter((r) => r.replied)
                                            : recData.recipients.filter((r) => r.status === active)

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
                                          {r.replied ? (
                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-violet-700" title="Replied">
                                              <Reply className="h-3 w-3" />
                                            </span>
                                          ) : (
                                            <span className="text-slate-300">—</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                          <Link
                                            href={inboxUrl(r.phone, r.lead_id, r.lead_name)}
                                            className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#128C7E] transition hover:bg-[#25D366]/20"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            Open
                                          </Link>
                                        </td>
                                      </tr>
                                      ))
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                              {recData.recipients.length >= 200 && (
                                <p className="px-4 py-2 text-center text-xs text-amber-700">Showing first 200 recipients. Use date filters to narrow the range.</p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Activity Trend ── */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Activity className="h-4 w-4" /></span>
              Activity Trend
              <span className="ml-auto text-xs font-normal text-slate-400">Daily sent vs received</span>
            </h2>
            {messagesOverTimeChart.length > 0 ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={messagesOverTimeChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
                        return raw ? new Date(raw + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''
                      }}
                      formatter={(value, name) => [formatInt(Number(value ?? 0)), name === 'sent' ? 'Sent' : name === 'received' ? 'Received' : 'Total']}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 12px 40px -12px rgb(0 0 0 / 0.2)' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 12 }} />
                    <Area type="monotone" dataKey="sent" stroke={WA_GREEN} strokeWidth={2} fill="url(#gradSent)" name="Sent" />
                    <Area type="monotone" dataKey="received" stroke={WA_TEAL} strokeWidth={2} fill="url(#gradRecv)" name="Received" />
                    <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={false} name="Total" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-slate-500">No time-series data</p>
            )}
          </div>

          {/* ── Broadcast Campaigns ── */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Megaphone className="h-4 w-4" /></span>
              Broadcast Campaigns
            </h2>
            <p className="mb-4 pl-10 text-xs text-slate-500">Scheduled or bulk broadcasts — sent, failed, and replies per campaign.</p>
            {campaigns.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No campaigns in this range.</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => {
                  const expanded = expandedCampaignId === c.id
                  return (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <button type="button" onClick={() => toggleCampaign(c)}
                        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-start gap-2">
                          {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                          <span>
                            <span className="font-semibold text-slate-900">{c.templateName}</span>
                            <span className="ml-2 text-xs font-normal text-slate-500">{c.templateLanguage}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {new Date(c.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {c.status}
                              {c.errorMessage ? ` · ${c.errorMessage}` : ''}
                            </span>
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-2 pl-7 sm:pl-0">
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{formatInt(c.recipientCount)} recipients</span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">{formatInt(c.sent)} sent</span>
                          <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">{formatInt(c.failed)} failed</span>
                          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800">{formatInt(c.repliedCount)} replied</span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                          {campaignDetailLoading && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
                            </div>
                          )}
                          {!campaignDetailLoading && campaignDetail?.id === c.id && (
                            <div className="grid gap-6 lg:grid-cols-2">
                              {/* Failed */}
                              <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-700">
                                  Failed ({formatInt(campaignDetail.failedRecipients.length)})
                                </p>
                                {campaignDetail.failedRecipients.length === 0 ? (
                                  <p className="text-sm text-slate-500">None recorded.</p>
                                ) : (
                                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-sm">
                                    {campaignDetail.failedRecipients.map((f, i) => (
                                      <li key={i} className="flex flex-col gap-0.5 border-b border-slate-50 pb-2 last:border-0">
                                        <span className="flex items-center justify-between gap-2">
                                          <span className="truncate font-medium text-slate-800">{f.name || '—'}</span>
                                          <span className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono text-xs text-slate-500">{f.phone}</span>
                                            <Link href={inboxUrl(f.phone, null, f.name)} className="inline-flex items-center gap-0.5 rounded bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#128C7E] hover:bg-[#25D366]/20">
                                              <ExternalLink className="h-2.5 w-2.5" /> Inbox
                                            </Link>
                                          </span>
                                        </span>
                                        <span className="text-xs text-rose-700">{f.error}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              {/* Replied */}
                              <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                                  Replied ({formatInt(campaignDetail.repliedRecipients.length)})
                                </p>
                                {campaignDetail.repliedRecipients.length === 0 ? (
                                  <p className="text-sm text-slate-500">No replies after send.</p>
                                ) : (
                                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-sm">
                                    {campaignDetail.repliedRecipients.map((r, i) => (
                                      <li key={i} className="flex flex-col gap-0.5 border-b border-slate-50 pb-2 last:border-0">
                                        <span className="flex items-center justify-between gap-2">
                                          <span className="flex items-center gap-1.5 truncate font-medium text-slate-800">
                                            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            {r.name || '—'}
                                          </span>
                                          <span className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono text-xs text-slate-500">{r.phone}</span>
                                            <Link href={inboxUrl(r.phone, null, r.name)} className="inline-flex items-center gap-0.5 rounded bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#128C7E] hover:bg-[#25D366]/20">
                                              <ExternalLink className="h-2.5 w-2.5" /> Inbox
                                            </Link>
                                          </span>
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                          {new Date(r.firstReplyAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
          </div>

          {/* ── Delivery & Leads ── */}
          {deliveryStatus && (
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ring-1 ring-slate-100">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><BarChart2 className="h-4 w-4" /></span>
                Delivery Funnel by Lead
              </h2>
              <p className="mb-4 pl-10 text-xs text-slate-500">Distinct leads grouped by their latest delivery status.</p>

              {/* Summary cards */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { key: 'read', label: 'Read', color: 'bg-sky-50 border-sky-200 text-sky-900' },
                  { key: 'delivered', label: 'Delivered', color: 'bg-teal-50 border-teal-200 text-teal-900' },
                  { key: 'sent', label: 'Sent', color: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
                  { key: 'failed', label: 'Failed', color: 'bg-rose-50 border-rose-200 text-rose-900' },
                  { key: 'pending', label: 'Pending', color: 'bg-amber-50 border-amber-200 text-amber-900' },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`rounded-xl border p-3 ${color}`}>
                    <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">
                      {formatInt(deliveryStatus.summary[key as keyof typeof deliveryStatus.summary] as number)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Delivery progress bar */}
              {(() => {
                const s = deliveryStatus.summary
                const total = s.read + s.delivered + s.sent + s.failed + s.pending || 1
                return (
                  <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-sky-400" style={{ width: `${(s.read / total) * 100}%` }} title="Read" />
                    <div className="h-full bg-teal-400" style={{ width: `${(s.delivered / total) * 100}%` }} title="Delivered" />
                    <div className="h-full bg-emerald-400" style={{ width: `${(s.sent / total) * 100}%` }} title="Sent" />
                    <div className="h-full bg-amber-400" style={{ width: `${(s.pending / total) * 100}%` }} title="Pending" />
                    <div className="h-full bg-rose-400" style={{ width: `${(s.failed / total) * 100}%` }} title="Failed" />
                  </div>
                )
              })()}

              {/* Expandable status groups */}
              <div className="space-y-2">
                {[
                  { key: 'failed', label: 'Failed', accent: 'text-rose-700 bg-rose-50' },
                  { key: 'read', label: 'Read', accent: 'text-sky-700 bg-sky-50' },
                  { key: 'delivered', label: 'Delivered (not read)', accent: 'text-teal-700 bg-teal-50' },
                  { key: 'sent', label: 'Sent (not delivered)', accent: 'text-emerald-700 bg-emerald-50' },
                  { key: 'pending', label: 'Pending', accent: 'text-amber-700 bg-amber-50' },
                ].map(({ key, label, accent }) => {
                  const isExp = expandedStatus === key
                  const items = deliveryStatus.byStatus[key]?.items ?? []
                  const count = deliveryStatus.summary[key as keyof typeof deliveryStatus.summary] as number
                  return (
                    <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <button type="button" onClick={() => setExpandedStatus(isExp ? null : key)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50">
                        <span className="flex items-center gap-2 font-semibold text-slate-900">
                          {isExp ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                          {label}
                        </span>
                        <span className={`rounded-full px-3 py-0.5 text-sm font-bold tabular-nums ${accent}`}>{formatInt(count)}</span>
                      </button>
                      {isExp && items.length > 0 && (
                        <div className="max-h-64 overflow-y-auto border-t border-slate-100">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <th className="px-4 py-2">Name</th>
                                <th className="px-4 py-2">Phone</th>
                                <th className="px-4 py-2 text-center">Inbox</th>
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
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <Link href="/marketing/bulk-whatsapp?retry=failed"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#20BA5A]">
                    <RotateCcw className="h-4 w-4" />
                    Retry failed recipients
                  </Link>
                  <p className="mt-2 text-xs text-slate-500">Opens Bulk WhatsApp with failed numbers prefilled.</p>
                </div>
              )}
            </div>
          )}

          <footer className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-center text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 mr-3"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /><strong>Meta Insights</strong> — official numbers via <code className="rounded bg-slate-100 px-1">/{'{WABA-ID}'}/template_analytics</code></span>
            ·
            <span className="inline-flex items-center gap-1.5 ml-3"><Activity className="h-3.5 w-3.5 text-slate-400" /><strong>CRM data</strong> from <code className="rounded bg-slate-100 px-1">whatsapp_messages</code> &amp; <code className="rounded bg-slate-100 px-1">scheduled_broadcasts</code></span>
          </footer>
        </>
      )}
    </div>
  )
}
