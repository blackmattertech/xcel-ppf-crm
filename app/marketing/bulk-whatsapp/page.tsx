'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Search, Loader2, Send, Users, UserCheck, ListOrdered, MessageCircle, ArrowLeft, Clock } from 'lucide-react'
import type { LeadRecipient, CustomerRecipient, PastedRecipient, Recipient, SendResult, WhatsAppTemplate, MetaTemplateOption } from '../_lib/types'
import { templateNameSimilar, normalizePhone, buildWhatsAppUrl } from '../_lib/utils'
import { cachedFetch } from '@/lib/api-client'

function BulkWhatsAppPageContent() {
  const [source, setSource] = useState<'leads' | 'customers' | 'paste'>('leads')
  const [leads, setLeads] = useState<LeadRecipient[]>([])
  const [customers, setCustomers] = useState<CustomerRecipient[]>([])
  const [pastedText, setPastedText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
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
  const [delayMs, setDelayMs] = useState(250)
  const [scheduleAt, setScheduleAt] = useState('')
  const [processingScheduled, setProcessingScheduled] = useState(false)
  const [processScheduledResult, setProcessScheduledResult] = useState<{
    processed: number
    results?: Array<{ id: string; status: string; sent?: number; failed?: number; error?: string }>
    message?: string
    debug?: { pendingCount?: number; dueCount?: number }
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
    if (source !== 'leads') return
    setLoading(true)
    setLoadError(null)
    cachedFetch('/api/leads')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to leads." : 'Failed to load leads')
        return res.json()
      })
      .then((data) => {
        const list: LeadRecipient[] = (data.leads || []).map((l: { id: string; name?: string; phone?: string }) => ({
          id: l.id,
          name: l.name || '—',
          phone: l.phone || '',
          type: 'lead' as const,
        })).filter((r: LeadRecipient) => normalizePhone(r.phone).length >= 10)
        setLeads(list)
        setSelectedIds(new Set())
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [source])

  useEffect(() => {
    if (source !== 'customers') return
    setLoading(true)
    setLoadError(null)
    cachedFetch('/api/customers')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to customers." : 'Failed to load customers')
        return res.json()
      })
      .then((data) => {
        const list: CustomerRecipient[] = (data.customers || []).map((c: { id: string; name?: string; phone?: string }) => ({
          id: c.id,
          name: c.name || '—',
          phone: c.phone || '',
          type: 'customer' as const,
        })).filter((r: CustomerRecipient) => normalizePhone(r.phone).length >= 10)
        setCustomers(list)
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
    if (source === 'leads') return leads
    if (source === 'customers') return customers
    return pastedRecipients
  }, [source, leads, customers, pastedRecipients])

  const filteredRecipients = useMemo(() => {
    if (!search.trim()) return allRecipients
    const q = search.toLowerCase()
    return allRecipients.filter(
      (r) => r.name.toLowerCase().includes(q) || normalizePhone(r.phone).includes(q.replace(/\D/g, ''))
    )
  }, [allRecipients, search])

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

  const processScheduledNow = async () => {
    setProcessingScheduled(true)
    setProcessScheduledResult(null)
    try {
      const res = await cachedFetch('/api/marketing/whatsapp/process-scheduled', {
        method: 'GET',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setProcessScheduledResult({
          processed: 0,
          results: [{ id: '', status: 'error', error: data?.error ?? `HTTP ${res.status}` }],
          message: data?.error,
        })
        return
      }
      setProcessScheduledResult({
        processed: data.processed ?? 0,
        results: data.results ?? [],
        message: data.message,
        debug: data.debug,
      })
    } catch (e) {
      setProcessScheduledResult({
        processed: 0,
        results: [{ id: '', status: 'error', error: e instanceof Error ? e.message : 'Request failed' }],
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
        setSendResult({
          sent: 0,
          failed: 0,
          results: [],
          scheduled: true,
          scheduledAt: data.scheduledAt,
          scheduleMessage: data.message ?? `Scheduled for ${scheduledAtDate.toLocaleString()}. GitHub Actions (every minute) or "Process scheduled broadcasts now" will send it.`,
        })
      } else {
        const BATCH_SIZE = 100
        const payload = { ...basePayload, recipients: [] as typeof recipients }
        let totalSent = 0
        let totalFailed = 0
        const allResults: SendResult['results'] = []
        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
          const batch = recipients.slice(i, i + BATCH_SIZE)
          payload.recipients = batch
          const res = await cachedFetch('/api/marketing/whatsapp/send-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const data = await res.json()
          if (!res.ok) {
            batch.forEach((r) => {
              allResults.push({ phone: r.phone, success: false, error: data?.error ?? `HTTP ${res.status}` })
              totalFailed++
            })
          } else {
            totalSent += data.sent ?? 0
            totalFailed += data.failed ?? 0
            if (Array.isArray(data.results)) allResults.push(...data.results)
          }
        }
        setSendResult({ sent: totalSent, failed: totalFailed, results: allResults })
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
    <div className="space-y-6">
      <Link
        href="/marketing/whatsapp"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to WhatsApp
      </Link>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-3">Recipient source</label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'leads' as const, label: 'Leads', icon: Users },
            { value: 'customers' as const, label: 'Customers', icon: UserCheck },
            { value: 'paste' as const, label: 'Paste numbers', icon: ListOrdered },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSource(value)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                source === value
                  ? 'border-[#ed1b24] bg-red-50 text-[#ed1b24]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {source === 'paste' ? (
          <div className="p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste numbers (one per line, or &quot;Name, Number&quot;)
            </label>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="9876543210&#10;John, 9876543210&#10;+91 98765 43210"
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#ed1b24] focus:outline-none focus:ring-1 focus:ring-[#ed1b24]"
            />
            {pastedRecipients.length > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                {pastedRecipients.length} valid number(s) (min 10 digits)
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[#ed1b24] focus:outline-none focus:ring-1 focus:ring-[#ed1b24]"
                />
              </div>
              <button type="button" onClick={selectAll} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Select all
              </button>
              <button type="button" onClick={clearSelection} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Clear
              </button>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#ed1b24]" />
                </div>
              ) : loadError ? (
                <div className="p-6 text-center text-sm text-red-600">{loadError}</div>
              ) : filteredRecipients.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No recipients found.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredRecipients.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        className="h-4 w-4 rounded border-gray-300 text-[#ed1b24] focus:ring-[#ed1b24]"
                      />
                      <span className="flex-1 truncate text-sm font-medium text-gray-900">{r.name}</span>
                      <span className="text-sm text-gray-500 font-mono">{r.phone}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {apiConfigured ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Approved template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value)
                  setTemplateParamValues([])
                  setTemplateHeaderParamValues([])
                  clearSendResult()
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <p className="mt-1 text-xs text-gray-500">
                  Prefer options labeled <strong>— from Meta</strong> so name and language match Meta exactly (avoids #132001).
                </p>
              )}
              {approvedTemplates.length === 0 && metaTemplates.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">No templates. Create one in Message templates or add in Meta WhatsApp dashboard, then sync.</p>
              )}
            </div>
            {templateParamCount > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Body variables (same for all recipients)</label>
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                ))}
              </div>
            )}
            {templateHeaderParamCount > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Header variables (same for all recipients)</label>
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Delay between messages (ms)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60000}
                  step={100}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Math.max(0, Math.min(60000, parseInt(e.target.value, 10) || 0)))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">e.g. 250–1000 to avoid rate limits</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule for (optional)</label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to send now</p>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
              <p className="text-sm text-gray-600">
                Due broadcasts are processed by this app&apos;s API (<code className="text-xs bg-gray-100 px-1 rounded">/api/marketing/whatsapp/process-scheduled</code>).
                Your GitHub Actions workflow should call <code className="text-xs bg-gray-100 px-1 rounded">/api/cron/whatsapp-process-scheduled</code> every minute, or use the button below to run the processor now while signed in.
              </p>
              <button
                type="button"
                onClick={processScheduledNow}
                disabled={processingScheduled}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {processingScheduled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                Process scheduled broadcasts now
              </button>
              {processScheduledResult != null && (
                <div className="text-sm">
                  {processScheduledResult.results?.some((r) => r.error) && (
                    <p className="text-red-600 font-medium">
                      {processScheduledResult.results.find((r) => r.error)?.error ?? 'Error'}
                    </p>
                  )}
                  {processScheduledResult.message && (
                    <p className="text-gray-700">{processScheduledResult.message}</p>
                  )}
                  {processScheduledResult.debug && (processScheduledResult.debug.pendingCount != null || processScheduledResult.debug.dueCount != null) && (
                    <p className="text-gray-500 text-xs mt-1">
                      Pending: {processScheduledResult.debug.pendingCount ?? 0}, due now: {processScheduledResult.debug.dueCount ?? 0}
                    </p>
                  )}
                  {processScheduledResult.processed > 0 && (
                    <p className="text-gray-700">
                      Processed {processScheduledResult.processed}:{' '}
                      {processScheduledResult.results?.map((r) => (r.sent != null ? `${r.sent} sent` : r.error ?? r.status)).join(', ') ?? ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-amber-600">
            Configure WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to use template broadcast.
          </p>
        )}
      </div>

      {sendResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {sendResult.scheduled ? (
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-green-600">Scheduled</span>
                {sendResult.scheduleMessage && <span className="ml-2 text-gray-600">{sendResult.scheduleMessage}</span>}
              </p>
            ) : sendResult.scheduleError ? (
              <p className="text-sm text-red-600">{sendResult.scheduleError}</p>
            ) : (
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-green-600">{sendResult.sent} sent</span>
                {sendResult.failed > 0 && (
                  <span className="text-red-600 font-semibold ml-2">{sendResult.failed} failed</span>
                )}
              </p>
            )}
            <button type="button" onClick={clearSendResult} className="text-sm text-gray-500 hover:text-gray-700 underline">
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

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{count}</span> recipient{count !== 1 ? 's' : ''} selected
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyAllNumbers}
            disabled={count === 0}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
          >
            Copy numbers
          </button>
          {apiConfigured ? (
            <button
              type="button"
              onClick={sendTemplateViaApi}
              disabled={count === 0 || !selectedTemplateId || sending || (templateParamCount > 0 && templateParamValues.slice(0, templateParamCount).some((v) => !v?.trim())) || (templateHeaderParamCount > 0 && templateHeaderParamValues.slice(0, templateHeaderParamCount).some((v) => !v?.trim()))}
              className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#20BA5A] disabled:opacity-50 disabled:pointer-events-none"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduleAt.trim() ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {sending ? (scheduleAt.trim() ? 'Scheduling…' : 'Sending…') : scheduleAt.trim() ? 'Schedule broadcast' : 'Send template broadcast'}
            </button>
          ) : (
            <span className="text-sm text-gray-500">Configure WhatsApp API to send template broadcasts.</span>
          )}
        </div>
      </div>

      {apiConfigured === false && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Meta WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to send via API.
        </p>
      )}

      <details className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100">
          Message not received? Check these
        </summary>
        <ul className="px-4 pb-3 pt-1 text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li><strong>Development mode:</strong> Add the recipient&apos;s number to the allowlist in Meta for Developers → WhatsApp → API Setup.</li>
          <li>Bulk broadcast uses <strong>approved templates only</strong>. Create and approve templates in Message templates.</li>
          <li>Use full number with country code. In .env use the <strong>Phone number ID</strong> from API Setup.</li>
        </ul>
      </details>

      {count > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">Open individual chats</h3>
            <p className="text-xs text-gray-500 mt-0.5">Click to open each contact in WhatsApp</p>
          </div>
          <ul className="max-h-[240px] overflow-y-auto divide-y divide-gray-100">
            {selectedRecipients.map((r) => {
              const url = buildWhatsAppUrl(r.phone, '')
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50">
                  <span className="truncate text-sm text-gray-900">{r.name}</span>
                  <span className="text-sm text-gray-500 font-mono shrink-0">{r.phone}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#20BA5A]"
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
          <Loader2 className="h-10 w-10 animate-spin text-[#ed1b24]" aria-label="Loading" />
        </div>
      }
    >
      <BulkWhatsAppPageContent />
    </Suspense>
  )
}
