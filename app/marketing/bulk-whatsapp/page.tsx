'use client'

import { useState, useEffect, useMemo, useRef, Suspense, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Search,
  Loader2,
  Send,
  Users,
  UserCheck,
  ListOrdered,
  MessageCircle,
  ArrowLeft,
  Clock,
  LayoutTemplate,
  Upload,
  Download,
} from 'lucide-react'
import type {
  LeadRecipient,
  CustomerRecipient,
  PastedRecipient,
  Recipient,
  SendResult,
  WhatsAppTemplate,
  MetaTemplateOption,
} from '../_lib/types'

/** Extra text used for universal search (name, phone, email, etc.) — not sent to API. */
type LeadRecipientRow = LeadRecipient & { searchHaystack: string }
type CustomerRecipientRow = CustomerRecipient & { searchHaystack: string }
type ListRecipientRow = LeadRecipientRow | CustomerRecipientRow

function lowerHay(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((p) => p != null && String(p).trim() !== '')
    .map((p) => String(p).toLowerCase())
    .join(' ')
}

function matchesUniversalSearch(haystack: string, rawPhone: string, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const phoneNorm = normalizePhone(rawPhone)
  const queryDigits = q.replace(/\D/g, '')
  if (queryDigits.length >= 3 && phoneNorm.includes(queryDigits)) return true
  const terms = q.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  return terms.every((term) => {
    const td = term.replace(/\D/g, '')
    if (td.length >= 3 && phoneNorm.includes(td)) return true
    return haystack.includes(term)
  })
}
import { templateNameSimilar, normalizePhone, buildWhatsAppUrl } from '../_lib/utils'
import { cachedFetch } from '@/lib/api-client'
import {
  parseRecipientsFromCsvText,
  parseRecipientsFromXlsxBuffer,
  getSampleRecipientCsv,
  getSampleRecipientXlsxArrayBuffer,
} from '../_lib/parse-recipient-file'

const cardShell =
  'rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm ring-1 ring-slate-100/80 overflow-hidden'
const sectionLabel = 'text-xs font-semibold uppercase tracking-wide text-slate-500'
const fieldInput =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/15'
const btnSecondary =
  'rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.99]'
const btnPrimaryWa =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition hover:bg-[#20BA5A] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50'

function BulkWhatsAppPageContent() {
  const [source, setSource] = useState<'leads' | 'customers' | 'paste'>('leads')
  const [leads, setLeads] = useState<LeadRecipientRow[]>([])
  const [customers, setCustomers] = useState<CustomerRecipientRow[]>([])
  const [pastedText, setPastedText] = useState('')
  const [uploadHint, setUploadHint] = useState<string | null>(null)
  const recipientFileInputRef = useRef<HTMLInputElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [searchTrigger, setSearchTrigger] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  // Bulk broadcast is template-only
  const [approvedTemplates, setApprovedTemplates] = useState<WhatsAppTemplate[]>([])
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplateOption[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateParamValues, setTemplateParamValues] = useState<string[]>([])
  const [templateHeaderParamValues, setTemplateHeaderParamValues] = useState<string[]>([])
  const [delayMs, setDelayMs] = useState(0)
  const [scheduleAt, setScheduleAt] = useState('')
  const [processingScheduled, setProcessingScheduled] = useState(false)
  const [processScheduledResult, setProcessScheduledResult] = useState<{
    processed: number
    results?: Array<{ id: string; status: string; sent?: number; failed?: number; error?: string }>
    message?: string
    debug?: { pendingCount?: number; dueCount?: number; remainingDue?: number; drainRounds?: number }
  } | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const retry = searchParams.get('retry')
    if (retry === 'failed') {
      cachedFetch('/api/marketing/whatsapp/delivery-status')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.byStatus?.failed?.items?.length) {
            const lines = data.byStatus.failed.items.map(
              (item: { phone: string; lead_name?: string | null }) =>
                (item.lead_name ? `${item.lead_name}, ` : '') + item.phone
            )
            setPastedText(lines.join('\n'))
            setSource('paste')
          }
        })
        .catch(() => {})
    }
  }, [searchParams])

  useEffect(() => {
    cachedFetch('/api/marketing/whatsapp/config')
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => setApiConfigured(!!data?.configured))
      .catch(() => setApiConfigured(false))
  }, [])

  useEffect(() => {
    if (!apiConfigured) return
    Promise.all([
      cachedFetch('/api/marketing/whatsapp/templates?status=approved').then((res) => (res.ok ? res.json() : { templates: [] })),
      cachedFetch('/api/marketing/whatsapp/templates/from-meta').then((res) => (res.ok ? res.json() : { templates: [] })),
    ])
      .then(([local, meta]) => {
        setApprovedTemplates(local.templates || [])
        setMetaTemplates(meta.templates || [])
      })
      .catch(() => {
        setApprovedTemplates([])
        setMetaTemplates([])
      })
  }, [apiConfigured])

  useEffect(() => {
    if (!selectedTemplateId || selectedTemplateId.startsWith('meta:')) return
    const local = approvedTemplates.find((t) => t.id === selectedTemplateId)
    if (!local) return
    const exactMatch = metaTemplates.find((m) => m.name === local.name)
    if (exactMatch) {
      setSelectedTemplateId(`meta:${exactMatch.name}:${exactMatch.language}`)
      return
    }
    const similarMeta = metaTemplates.find((m) => templateNameSimilar(local.name, m.name))
    if (similarMeta) setSelectedTemplateId(`meta:${similarMeta.name}:${similarMeta.language}`)
  }, [approvedTemplates, metaTemplates, selectedTemplateId])

  useEffect(() => {
    if (source === 'paste') {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    Promise.all([
      cachedFetch('/api/leads').then((res) => (res.ok ? res.json() : { leads: [] })),
      cachedFetch('/api/customers').then((res) => (res.ok ? res.json() : { customers: [] })),
    ])
      .then(([leadsData, customersData]) => {
        const leadList: LeadRecipientRow[] = (leadsData.leads || [])
          .map(
            (l: {
              id: string
              name?: string | null
              phone?: string | null
              email?: string | null
              requirement?: string | null
              campaign_name?: string | null
              ad_name?: string | null
              lead_id?: string | null
            }) => {
              const name = l.name?.trim() || '—'
              const phone = l.phone || ''
              const searchHaystack = lowerHay(
                name,
                phone,
                normalizePhone(phone),
                l.email,
                l.requirement,
                l.campaign_name,
                l.ad_name,
                l.lead_id
              )
              return {
                id: l.id,
                name,
                phone,
                type: 'lead' as const,
                searchHaystack,
              }
            }
          )
          .filter((r: LeadRecipientRow) => normalizePhone(r.phone).length >= 10)
        const custList: CustomerRecipientRow[] = (customersData.customers || [])
          .map(
            (c: {
              id: string
              name?: string | null
              phone?: string | null
              email?: string | null
              dealer_name?: string | null
              car_model?: string | null
              car_name?: string | null
              service_type?: string | null
              chassis_number?: string | null
              car_number?: string | null
            }) => {
              const name = c.name?.trim() || '—'
              const phone = c.phone || ''
              const searchHaystack = lowerHay(
                name,
                phone,
                normalizePhone(phone),
                c.email,
                c.dealer_name,
                c.car_model,
                c.car_name,
                c.service_type,
                c.chassis_number,
                c.car_number
              )
              return {
                id: c.id,
                name,
                phone,
                type: 'customer' as const,
                searchHaystack,
              }
            }
          )
          .filter((r: CustomerRecipientRow) => normalizePhone(r.phone).length >= 10)
        setLeads(leadList)
        setCustomers(custList)
        setSelectedIds(new Set())
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [source])

  const pastedRecipients = useMemo((): PastedRecipient[] => {
    if (source !== 'paste' || !pastedText.trim()) return []
    const lines = pastedText.split(/\n/).map((s) => s.trim()).filter(Boolean)
    return lines.map((line, i) => {
      const match = line.match(/^(.+?)[,\t]\s*(\d[\d\s\-+]+)$/)
      const name = match ? match[1].trim() : '—'
      const phone = match ? match[2].replace(/\D/g, '') : line.replace(/\D/g, '')
      return {
        id: `pasted-${i}-${phone}`,
        name,
        phone: phone || line,
        type: 'pasted' as const,
      }
    }).filter((r) => normalizePhone(r.phone).length >= 10)
  }, [source, pastedText])

  const allRecipients: Recipient[] = useMemo(() => {
    if (source === 'paste') return pastedRecipients
    return [...leads, ...customers]
  }, [source, leads, customers, pastedRecipients])

  const filteredRecipients = useMemo(() => {
    const rawQuery = search.trim()
    if (!rawQuery) {
      if (source === 'leads') return leads
      if (source === 'customers') return customers
      return pastedRecipients
    }
    // Universal search: match leads and customers together (by name, phone, email, and other mapped fields).
    return allRecipients.filter((r) => {
      if (r.type === 'pasted') {
        const hay = lowerHay(r.name, r.phone, normalizePhone(r.phone))
        return matchesUniversalSearch(hay, r.phone, rawQuery)
      }
      const row = r as ListRecipientRow
      return matchesUniversalSearch(row.searchHaystack, row.phone, rawQuery)
    })
  }, [search, searchTrigger, source, leads, customers, pastedRecipients, allRecipients])

  const selectedRecipients = useMemo(() => {
    if (source === 'paste') return pastedRecipients
    return allRecipients.filter((r) => selectedIds.has(r.id))
  }, [source, allRecipients, pastedRecipients, selectedIds])

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (source === 'paste') return
    setSelectedIds(new Set(filteredRecipients.map((r) => r.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())
  const clearSendResult = () => setSendResult(null)

  const onRecipientFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadHint(null)
    const ext = file.name.toLowerCase().split('.').pop() || ''
    try {
      if (ext === 'csv') {
        const text = await file.text()
        const result = parseRecipientsFromCsvText(text)
        if (result.lines.length === 0) {
          setUploadHint(
            'No valid numbers found. Use a header row with a Phone or Mobile column, or two columns (name and number).'
          )
          return
        }
        setSource('paste')
        setPastedText(result.lines.join('\n'))
        setUploadHint(
          `Loaded ${result.lines.length} number${result.lines.length !== 1 ? 's' : ''} from ${file.name}` +
            (result.skipped ? ` (${result.skipped} row${result.skipped !== 1 ? 's' : ''} skipped)` : '') +
            '.'
        )
        return
      }
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer()
        const result = parseRecipientsFromXlsxBuffer(buf)
        if (result.lines.length === 0) {
          setUploadHint(
            'No valid numbers found. Put numbers in a column named Phone or Mobile, or use two columns (name and number).'
          )
          return
        }
        setSource('paste')
        setPastedText(result.lines.join('\n'))
        setUploadHint(
          `Loaded ${result.lines.length} number${result.lines.length !== 1 ? 's' : ''} from ${file.name}` +
            (result.skipped ? ` (${result.skipped} row${result.skipped !== 1 ? 's' : ''} skipped)` : '') +
            '.'
        )
        return
      }
      setUploadHint('Please choose a .csv, .xls, or .xlsx file.')
    } catch (err) {
      setUploadHint(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  const downloadSampleCsv = () => {
    const blob = new Blob([getSampleRecipientCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'whatsapp-recipients-sample.csv'
    a.rel = 'noopener'
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadSampleXlsx = () => {
    const buf = getSampleRecipientXlsxArrayBuffer()
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'whatsapp-recipients-sample.xlsx'
    a.rel = 'noopener'
    a.click()
    URL.revokeObjectURL(url)
  }

  const processScheduledNow = async () => {
    setProcessingScheduled(true)
    setProcessScheduledResult(null)
    const params = new URLSearchParams({
      maxJobs: '30',
      maxRuntimeMs: '240000',
    })
    const aggregatedResults: Array<{
      id: string
      status: string
      sent?: number
      failed?: number
      error?: string
      note?: string
    }> = []
    let totalProcessed = 0
    let lastMessage: string | undefined
    let lastDebug: Record<string, unknown> | undefined
    const maxRounds = 50
    let roundsRun = 0
    try {
      for (let round = 0; round < maxRounds; round++) {
        roundsRun = round + 1
        const res = await cachedFetch(`/api/marketing/whatsapp/process-scheduled?${params}`, {
          method: 'GET',
          credentials: 'include',
        })
        const data = (await res.json().catch(() => ({}))) as {
          processed?: number
          results?: typeof aggregatedResults
          message?: string
          debug?: Record<string, unknown>
          error?: string
        }
        if (!res.ok) {
          setProcessScheduledResult({
            processed: totalProcessed,
            results: [
              ...aggregatedResults,
              { id: '', status: 'error', error: data?.error ?? `HTTP ${res.status}` },
            ],
            message: data?.error,
            debug: lastDebug,
          })
          return
        }
        lastMessage = data.message
        lastDebug = data.debug
        const n = data.processed ?? 0
        totalProcessed += n
        if (Array.isArray(data.results)) aggregatedResults.push(...data.results)
        const remainingDue = typeof data.debug?.remainingDue === 'number' ? data.debug.remainingDue : 0
        if (remainingDue === 0) break
        if (n === 0) break
        await new Promise((r) => setTimeout(r, 500))
      }
      setProcessScheduledResult({
        processed: totalProcessed,
        results: aggregatedResults,
        message: lastMessage,
        debug: lastDebug ? { ...lastDebug, drainRounds: roundsRun } : undefined,
      })
    } catch (e) {
      setProcessScheduledResult({
        processed: totalProcessed,
        results: [
          ...aggregatedResults,
          { id: '', status: 'error', error: e instanceof Error ? e.message : 'Request failed' },
        ],
        debug: lastDebug,
      })
    } finally {
      setProcessingScheduled(false)
    }
  }

  const copyAllNumbers = () => {
    const nums = selectedRecipients.map((r) => normalizePhone(r.phone)).filter(Boolean)
    const unique = [...new Set(nums)]
    navigator.clipboard.writeText(unique.join('\n'))
  }

  const count = selectedRecipients.length

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((t) => t.id === selectedTemplateId),
    [approvedTemplates, selectedTemplateId]
  )
  const selectedMetaTemplate = useMemo(() => {
    if (!selectedTemplateId.startsWith('meta:')) return null
    const [, name, language] = selectedTemplateId.split(':')
    return name && language ? { name, language } : null
  }, [selectedTemplateId])

  const resolvedTemplateForParams = useMemo(() => {
    if (selectedMetaTemplate) {
      const meta = metaTemplates.find((m) => m.name === selectedMetaTemplate?.name && m.language === selectedMetaTemplate?.language)
      return meta ? { body_text: meta.body_text ?? '', header_text: meta.header_text ?? null } : null
    }
    return selectedTemplate ? { body_text: selectedTemplate.body_text ?? '', header_text: selectedTemplate.header_text ?? null } : null
  }, [selectedMetaTemplate, selectedTemplate, metaTemplates])

  const templateParamCount = useMemo(() => {
    if (!resolvedTemplateForParams?.body_text) return 0
    const matches = resolvedTemplateForParams.body_text.match(/\{\{(\d+)\}\}/g)
    if (!matches) return 0
    const indices = new Set(matches.map((m) => parseInt(m.replace(/\{\{|\}\}/g, ''), 10)))
    return indices.size === 0 ? 0 : Math.max(...indices)
  }, [resolvedTemplateForParams])

  const templateHeaderParamCount = useMemo(() => {
    const headerText = resolvedTemplateForParams?.header_text
    if (!headerText || typeof headerText !== 'string') return 0
    const matches = headerText.match(/\{\{(\d+)\}\}/g)
    if (!matches) return 0
    const indices = new Set(matches.map((m) => parseInt(m.replace(/\{\{|\}\}/g, ''), 10)))
    return indices.size === 0 ? 0 : Math.max(...indices)
  }, [resolvedTemplateForParams])

  const sendTemplateViaApi = async () => {
    if (!selectedTemplateId || count === 0) return
    const isMetaTemplate = selectedMetaTemplate != null
    const template = approvedTemplates.find((t) => t.id === selectedTemplateId)
    if (!isMetaTemplate && !template) return
    setSending(true)
    setSendResult(null)
    const recipients = selectedRecipients.map((r) => ({ phone: r.phone, name: r.name }))
    const bodyParameters = templateParamCount > 0 ? templateParamValues.slice(0, templateParamCount) : undefined
    const headerParameters = templateHeaderParamCount > 0 ? templateHeaderParamValues.slice(0, templateHeaderParamCount) : undefined
    const basePayload: Record<string, unknown> = {
      bodyParameters,
      headerParameters,
      defaultCountryCode: '91',
      delayMs,
    }
    if (isMetaTemplate && selectedMetaTemplate) {
      basePayload.templateName = selectedMetaTemplate.name
      basePayload.templateLanguage = selectedMetaTemplate.language
    } else {
      basePayload.templateId = selectedTemplateId
    }

    const isScheduled = scheduleAt.trim() !== ''
    try {
      if (isScheduled) {
        const scheduledAtDate = new Date(scheduleAt)
        if (isNaN(scheduledAtDate.getTime())) {
          setSendResult({
            sent: 0,
            failed: count,
            results: [],
            scheduleError: 'Invalid date/time for schedule',
          })
          return
        }
        const res = await cachedFetch('/api/marketing/whatsapp/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...basePayload,
            scheduledAt: scheduledAtDate.toISOString(),
            recipients,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setSendResult({
            sent: 0,
            failed: count,
            results: [],
            scheduleError: data?.error ?? `HTTP ${res.status}`,
          })
          return
        }
        const atIso = typeof data.scheduledAt === 'string' ? data.scheduledAt : scheduledAtDate.toISOString()
        const whenLocal = new Date(atIso).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
        const hint =
          data.message ??
          'Your GitHub Actions workflow (every 5 minutes, UTC) or "Process scheduled broadcasts now" will send it.'
        const scheduleMessage = data.adjustedToNow
          ? `Your pick was in the past — queued to send now (${whenLocal} your time). ${hint}`
          : `Scheduled for ${whenLocal} (your time). ${hint}`

        setSendResult({
          sent: 0,
          failed: 0,
          results: [],
          scheduled: true,
          scheduledAt: data.scheduledAt,
          scheduleMessage,
        })
      } else {
        const SCHEDULE_CHUNK = 5000
        const scheduledAtIso = new Date().toISOString()
        const processorHint =
          'Your GitHub Actions workflow (every 5 minutes, UTC) or "Process scheduled broadcasts now" will send it.'
        const chunks: typeof recipients[] = []
        for (let i = 0; i < recipients.length; i += SCHEDULE_CHUNK) {
          chunks.push(recipients.slice(i, i + SCHEDULE_CHUNK))
        }
        for (let c = 0; c < chunks.length; c++) {
          const res = await cachedFetch('/api/marketing/whatsapp/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              scheduledAt: scheduledAtIso,
              recipients: chunks[c],
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            setSendResult({
              sent: 0,
              failed: count,
              results: [],
              scheduleError:
                (data as { error?: string })?.error ??
                `HTTP ${res.status}` +
                  (chunks.length > 1 ? ` (queued batch ${c + 1} of ${chunks.length})` : ''),
            })
            return
          }
        }
        const scheduleMessage =
          chunks.length > 1
            ? `Queued ${chunks.length} jobs for ${count.toLocaleString()} recipients. ${processorHint}`
            : `Queued to send in the background (${count.toLocaleString()} recipients). ${processorHint}`
        setSendResult({
          sent: 0,
          failed: 0,
          results: [],
          scheduled: true,
          scheduledAt: scheduledAtIso,
          scheduleMessage,
        })
      }
    } catch (e) {
      setSendResult({
        sent: 0,
        failed: count,
        results: [],
        scheduleError: isScheduled ? (e instanceof Error ? e.message : 'Request failed') : undefined,
        ...(!isScheduled && {
          results: selectedRecipients.map((r) => ({
            phone: r.phone,
            success: false,
            error: e instanceof Error ? e.message : 'Request failed',
          })),
        }),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-5 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#25D366]/20 blur-3xl" />
        <Link
          href="/marketing/whatsapp"
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition hover:bg-white/20"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          WhatsApp hub
        </Link>
        <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Bulk broadcast</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
          Pick recipients, choose an approved template, then queue delivery (immediate or scheduled). Sends run in the background via your WhatsApp Business API.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-7">
          <div className={`${cardShell} p-5 sm:p-6`}>
            <p className={sectionLabel}>Recipient source</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: 'leads' as const, label: 'Leads', icon: Users },
                { value: 'customers' as const, label: 'Customers', icon: UserCheck },
                { value: 'paste' as const, label: 'Paste / upload', icon: ListOrdered },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSource(value)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                    source === value
                      ? 'border-emerald-500/70 bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-500/20'
                      : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={cardShell}>
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
              <p className={sectionLabel}>Audience</p>
                <p className="mt-1 text-sm text-slate-600">
                {source === 'paste'
                  ? 'Paste one number per line, use Name + number, or upload a CSV / Excel file.'
                  : 'Search matches leads and customers together (name, phone, email, and more). Tabs only filter the list when the search box is empty.'}
              </p>
            </div>
            {source === 'paste' ? (
              <div className="p-5 sm:p-6">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className={sectionLabel}>Numbers</label>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <input
                      ref={recipientFileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      className="sr-only"
                      onChange={onRecipientFileSelected}
                    />
                    <button
                      type="button"
                      onClick={downloadSampleCsv}
                      className={`${btnSecondary} inline-flex items-center gap-2`}
                    >
                      <Download className="h-4 w-4 text-slate-600" />
                      Sample CSV
                    </button>
                
                    <button
                      type="button"
                      onClick={() => recipientFileInputRef.current?.click()}
                      className={`${btnSecondary} inline-flex items-center gap-2`}
                    >
                      <Upload className="h-4 w-4 text-slate-600" />
                      Upload CSV / Excel
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-slate-500">
                  Phone numbers are read from a column named <span className="font-mono text-slate-600">numbers</span>,{' '}
                  <span className="font-mono text-slate-600">mobile</span>,{' '}
                  <span className="font-mono text-slate-600">mobile_number</span>,{' '}
                  <span className="font-mono text-slate-600">phone</span>, or{' '}
                  <span className="font-mono text-slate-600">phone_number</span> (underscores and spaces are OK). Download
                  a sample to see the layout.
                </p>
                <textarea
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value)
                    setUploadHint(null)
                  }}
                  placeholder="9876543210&#10;John, 9876543210&#10;+91 98765 43210&#10;&#10;Or upload a CSV/XLSX (use Sample CSV / Sample Excel for format)."
                  rows={7}
                  className={`${fieldInput} min-h-[160px] font-mono text-xs sm:text-sm`}
                />
                {uploadHint && (
                  <p className="mt-2 text-sm text-slate-600" role="status">
                    {uploadHint}
                  </p>
                )}
                {pastedRecipients.length > 0 && (
                  <p className="mt-3 text-sm font-medium text-emerald-800">
                    {pastedRecipients.length} valid number{pastedRecipients.length !== 1 ? 's' : ''} (min 10 digits)
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4 sm:px-5">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setSearchTrigger((t) => t + 1)
                      }}
                      placeholder="Search all leads & customers (name, phone, email…)"
                      className={`${fieldInput} py-2.5 pl-10`}
                    />
                  </div>
                  <button type="button" onClick={selectAll} className={btnSecondary}>
                    Select all
                  </button>
                  <button type="button" onClick={clearSelection} className={btnSecondary}>
                    Clear
                  </button>
                </div>
                <div className="max-h-[min(360px,50vh)] overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-14">
                      <Loader2 className="h-9 w-9 animate-spin text-emerald-600" />
                    </div>
                  ) : loadError ? (
                    <div className="p-8 text-center text-sm font-medium text-red-600">{loadError}</div>
                  ) : filteredRecipients.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">No recipients match your search.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {filteredRecipients.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center gap-3 px-4 py-3 transition hover:bg-emerald-50/40 sm:px-5"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{r.name}</span>
                          {r.type !== 'pasted' && (
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                r.type === 'lead'
                                  ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-200/80'
                                  : 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80'
                              }`}
                            >
                              {r.type === 'lead' ? 'Lead' : 'Customer'}
                            </span>
                          )}
                          <span className="shrink-0 font-mono text-xs text-slate-500 sm:text-sm">{r.phone}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-5 lg:sticky lg:top-6 lg:self-start">
          <div className={`${cardShell} space-y-5 p-5 sm:p-6`}>
            <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-600/10 text-emerald-800 ring-1 ring-emerald-500/15">
                <LayoutTemplate className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className={sectionLabel}>Template &amp; send</p>
                <p className="mt-0.5 text-sm text-slate-600">Approved Meta templates and timing.</p>
              </div>
            </div>
        {apiConfigured ? (
          <>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">Approved template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value)
                  setTemplateParamValues([])
                  setTemplateHeaderParamValues([])
                  clearSendResult()
                }}
                className={fieldInput}
              >
                <option value="">Select a template</option>
                {metaTemplates.map((t) => (
                  <option key={`meta:${t.name}:${t.language}`} value={`meta:${t.name}:${t.language}`}>
                    {t.name} ({t.language}) — from Meta
                  </option>
                ))}
                {approvedTemplates
                  .filter((l) => !metaTemplates.some((m) => m.name === l.name || templateNameSimilar(l.name, m.name)))
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                  ))}
              </select>
              {metaTemplates.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Prefer options labeled <strong className="text-slate-700">— from Meta</strong> so name and language match Meta exactly (avoids #132001).
                </p>
              )}
              {approvedTemplates.length === 0 && metaTemplates.length === 0 && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  No templates. Create one in Message templates or add in Meta WhatsApp dashboard, then sync.
                </p>
              )}
            </div>
            {templateParamCount > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-800">Body variables (same for all recipients)</label>
                {Array.from({ length: templateParamCount }, (_, i) => (
                  <input
                    key={i}
                    type="text"
                    value={templateParamValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...templateParamValues]
                      next[i] = e.target.value
                      setTemplateParamValues(next)
                    }}
                    placeholder={`{{${i + 1}}}`}
                    className={fieldInput}
                  />
                ))}
              </div>
            )}
            {templateHeaderParamCount > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-800">Header variables (same for all recipients)</label>
                {Array.from({ length: templateHeaderParamCount }, (_, i) => (
                  <input
                    key={i}
                    type="text"
                    value={templateHeaderParamValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...templateHeaderParamValues]
                      next[i] = e.target.value
                      setTemplateHeaderParamValues(next)
                    }}
                    placeholder={`Header {{${i + 1}}}`}
                    className={fieldInput}
                  />
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  Delay between messages (ms)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60000}
                  step={100}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Math.max(0, Math.min(60000, parseInt(e.target.value, 10) || 0)))}
                  className={fieldInput}
                />
                <p className="mt-1.5 text-xs text-slate-500">Use 0 for fastest send; increase only if Meta rate-limits.</p>
              </div>
              <div>
                <label className="mb-2 text-sm font-semibold text-slate-800">Schedule for (optional)</label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className={fieldInput}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Leave empty to queue for immediate delivery (GitHub Actions cron or &quot;Process scheduled now&quot; below).
                </p>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs leading-relaxed text-slate-600">
                Due jobs are processed via{' '}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200/80">
                  /api/marketing/whatsapp/process-scheduled
                </code>
                . Use GitHub Actions to call{' '}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200/80">
                  /api/cron/whatsapp-process-scheduled
                </code>{' '}
                on a schedule, or run the processor manually below.
              </p>
              <button
                type="button"
                onClick={processScheduledNow}
                disabled={processingScheduled}
                className={`${btnSecondary} inline-flex items-center gap-2`}
              >
                {processingScheduled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4 text-slate-500" />}
                Process scheduled now
              </button>
              {processScheduledResult != null && (
                <div className="space-y-1 text-sm">
                  {processScheduledResult.results?.some((r) => r.error) && (
                    <p className="font-medium text-red-600">
                      {processScheduledResult.results.find((r) => r.error)?.error ?? 'Error'}
                    </p>
                  )}
                  {processScheduledResult.message && <p className="text-slate-700">{processScheduledResult.message}</p>}
                  {processScheduledResult.debug &&
                    (processScheduledResult.debug.pendingCount != null ||
                      processScheduledResult.debug.dueCount != null ||
                      processScheduledResult.debug.remainingDue != null ||
                      processScheduledResult.debug.drainRounds != null) && (
                      <p className="text-xs text-slate-500">
                        {(processScheduledResult.debug.pendingCount != null ||
                          processScheduledResult.debug.dueCount != null) && (
                          <>
                            Pending: {processScheduledResult.debug.pendingCount ?? 0}, due now:{' '}
                            {processScheduledResult.debug.dueCount ?? 0}
                          </>
                        )}
                        {processScheduledResult.debug.remainingDue != null && (
                          <> · still due after last round: {processScheduledResult.debug.remainingDue}</>
                        )}
                        {processScheduledResult.debug.drainRounds != null && (
                          <> · drain rounds: {processScheduledResult.debug.drainRounds}</>
                        )}
                      </p>
                    )}
                  {processScheduledResult.processed > 0 && (
                    <p className="text-slate-700">
                      Processed {processScheduledResult.processed}:{' '}
                      {processScheduledResult.results?.map((r) => (r.sent != null ? `${r.sent} sent` : r.error ?? r.status)).join(', ') ?? ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm font-medium text-amber-800">
            Configure WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to use template broadcast.
          </p>
        )}
          </div>
        </div>
      </div>

      {sendResult && (
        <div
          className={`${cardShell} p-5 sm:p-6 ${
            sendResult.scheduleError ? 'ring-rose-200/60' : sendResult.scheduled ? 'ring-emerald-200/60' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sendResult.scheduled ? (
              <p className="text-sm leading-relaxed text-slate-700">
                <span className="font-bold text-emerald-600">Queued</span>
                {sendResult.scheduleMessage && <span className="ml-2 text-slate-600">{sendResult.scheduleMessage}</span>}
              </p>
            ) : sendResult.scheduleError ? (
              <p className="text-sm font-medium text-red-600">{sendResult.scheduleError}</p>
            ) : (
              <p className="text-sm text-slate-700">
                <span className="font-bold text-emerald-600">{sendResult.sent} sent</span>
                {sendResult.failed > 0 && <span className="ml-2 font-bold text-red-600">{sendResult.failed} failed</span>}
              </p>
            )}
            <button
              type="button"
              onClick={clearSendResult}
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-800"
            >
              Dismiss
            </button>
          </div>
          {!sendResult.scheduled && !sendResult.scheduleError && sendResult.failed > 0 && (
            <>
              {sendResult.results.some((r) => r.error && (r.error.includes('131030') || r.error.toLowerCase().includes('not in allowed list'))) && (
                <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <p className="font-medium">Recipient not in allowed list</p>
                  <p className="mt-1 text-amber-700">
                    In Development mode, add the number in Meta for Developers → WhatsApp → API Setup allowlist.
                  </p>
                </div>
              )}
              {sendResult.results.some((r) => r.error && (/132001|translation/i.test(r.error))) && (
                <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <p className="font-medium">Template or language mismatch (#132001)</p>
                  <p className="mt-1 text-amber-700">
                    Pick an option labeled &quot;— from Meta&quot; or sync in Message templates.
                  </p>
                </div>
              )}
              <ul className="mt-3 max-h-32 overflow-y-auto space-y-1 text-xs text-red-700">
                {sendResult.results.filter((r) => !r.success).map((r, i) => (
                  <li key={i}>{r.phone}: {r.error ?? 'Failed'}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div
        className={`${cardShell} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selection</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {count} <span className="text-base font-semibold text-slate-600">recipient{count !== 1 ? 's' : ''}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={copyAllNumbers}
            disabled={count === 0}
            className={`${btnSecondary} disabled:pointer-events-none disabled:opacity-40`}
          >
            Copy numbers
          </button>
          {apiConfigured ? (
            <button
              type="button"
              onClick={sendTemplateViaApi}
              disabled={
                count === 0 ||
                !selectedTemplateId ||
                sending ||
                (templateParamCount > 0 && templateParamValues.slice(0, templateParamCount).some((v) => !v?.trim())) ||
                (templateHeaderParamCount > 0 && templateHeaderParamValues.slice(0, templateHeaderParamCount).some((v) => !v?.trim()))
              }
              className={btnPrimaryWa}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduleAt.trim() ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {sending
                ? scheduleAt.trim()
                  ? 'Scheduling…'
                  : 'Queuing…'
                : scheduleAt.trim()
                  ? 'Schedule broadcast'
                  : 'Queue broadcast'}
            </button>
          ) : (
            <span className="text-sm text-slate-500">Configure WhatsApp API to send.</span>
          )}
        </div>
      </div>

      {apiConfigured === false && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-100">
          Meta WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to send via API.
        </div>
      )}

      <details className={`${cardShell} group`}>
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50/80 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Message not received? Check these
            <span className="text-slate-400 transition group-open:rotate-90">›</span>
          </span>
        </summary>
        <ul className="space-y-2 border-t border-slate-100 px-5 pb-5 pt-3 text-sm leading-relaxed text-slate-600 sm:px-6">
          <li>
            <strong className="text-slate-800">Development mode:</strong> Add the recipient&apos;s number to the allowlist in Meta for Developers → WhatsApp → API Setup.
          </li>
          <li>
            Bulk broadcast uses <strong className="text-slate-800">approved templates only</strong>. Create and approve templates in Message templates.
          </li>
          <li>
            Use full number with country code. In .env use the <strong className="text-slate-800">Phone number ID</strong> from API Setup.
          </li>
        </ul>
      </details>

      {count > 1 && (
        <div className={cardShell}>
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
            <h3 className="text-sm font-semibold text-slate-900">Open individual chats</h3>
            <p className="mt-0.5 text-xs text-slate-500">Quick links to WhatsApp Web / app per contact</p>
          </div>
          <ul className="max-h-[min(280px,40vh)] divide-y divide-slate-100 overflow-y-auto">
            {selectedRecipients.map((r) => {
              const url = buildWhatsAppUrl(r.phone, '')
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-emerald-50/30 sm:px-5"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-slate-900">{r.name}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-500 sm:text-sm">{r.phone}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#20BA5A]"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Open
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function BulkWhatsAppPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600" aria-label="Loading" />
        </div>
      }
    >
      <BulkWhatsAppPageContent />
    </Suspense>
  )
}
