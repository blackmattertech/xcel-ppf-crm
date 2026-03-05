'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Layout from '@/components/Layout'
import { TemplatePreview } from '@/app/marketing/_components/TemplatePreview'
import { MessageCircle, Megaphone, Search, Loader2, Send, Users, UserCheck, ListOrdered, FileText, RefreshCw, CheckCircle, Clock, XCircle, FileEdit, MessageSquare, BookOpen, Eye, Trash2, Upload } from 'lucide-react'

type MarketingTab = 'overview' | 'bulk-whatsapp' | 'templates' | 'chat'

/** True if two template names are likely the same (e.g. typo: welcom vs welcome). Hides local when Meta has similar name to avoid #132001. */
function templateNameSimilar(a: string, b: string): boolean {
  const x = a.toLowerCase().trim()
  const y = b.toLowerCase().trim()
  if (x === y) return true
  const lenDiff = Math.abs(x.length - y.length)
  if (lenDiff > 1) return false
  if (x.length === y.length) {
    let diff = 0
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++
    return diff <= 1
  }
  const [short, long] = x.length < y.length ? [x, y] : [y, x]
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true
  }
  return false
}

/** Meta-supported template languages: display name and code for dropdown & list. */
const META_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'en_US', name: 'English (US)' },
  { code: 'en_GB', name: 'English (UK)' },
  { code: 'en_IN', name: 'English (India)' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'ur', name: 'Urdu' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'es', name: 'Spanish' },
  { code: 'es_ES', name: 'Spanish (Spain)' },
  { code: 'es_MX', name: 'Spanish (Mexico)' },
  { code: 'pt_BR', name: 'Portuguese (Brazil)' },
  { code: 'pt_PT', name: 'Portuguese (Portugal)' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ar', name: 'Arabic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh_CN', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
]
function getLanguageName(code: string): string {
  return META_LANGUAGES.find((l) => l.code === code || l.code.replace('_', '') === code?.replace('_', ''))?.name ?? code
}

interface LeadRecipient {
  id: string
  name: string
  phone: string
  type: 'lead'
}

interface CustomerRecipient {
  id: string
  name: string
  phone: string
  type: 'customer'
}

interface PastedRecipient {
  id: string
  phone: string
  name: string
  type: 'pasted'
}

type Recipient = LeadRecipient | CustomerRecipient | PastedRecipient

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').trim()
}

function buildWhatsAppUrl(phone: string, text: string): string {
  const num = normalizePhone(phone)
  if (!num) return ''
  const params = new URLSearchParams()
  if (text.trim()) params.set('text', text.trim())
  const q = params.toString()
  return `https://wa.me/${num}${q ? `?${q}` : ''}`
}

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<MarketingTab>('bulk-whatsapp')

  return (
    <Layout>
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Marketing</h1>

        {/* Tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-6 inline-flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Megaphone className="h-4 w-4" />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'templates'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileText className="h-4 w-4" />
            Message templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk-whatsapp')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'bulk-whatsapp'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Bulk WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Chat with leads
          </button>
        </div>

        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'chat' && <ChatWithLeadsTab />}

        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'bulk-whatsapp' && <BulkWhatsAppTab />}
      </div>
    </Layout>
  )
}

interface SendResult {
  sent: number
  failed: number
  results: Array<{ phone: string; success: boolean; error?: string; metaResponse?: unknown }>
}

interface TemplateForOverview {
  id: string
  name: string
  language: string
  status: string
  category?: string
}

function OverviewTab() {
  const [loading, setLoading] = useState(true)
  const [apiConfigured, setApiConfigured] = useState(false)
  const [templates, setTemplates] = useState<TemplateForOverview[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch('/api/marketing/whatsapp/config').then((r) => (r.ok ? r.json() : { configured: false })),
      fetch('/api/marketing/whatsapp/templates').then((r) => {
        if (!r.ok) throw new Error('Failed to load templates')
        return r.json()
      }),
    ])
      .then(([config, data]) => {
        setApiConfigured(!!config?.configured)
        setTemplates(data?.templates ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const total = templates.length
    const approved = templates.filter((t) => t.status === 'approved').length
    const pending = templates.filter((t) => t.status === 'pending').length
    const rejected = templates.filter((t) => t.status === 'rejected').length
    const draft = templates.filter((t) => t.status === 'draft').length
    return { total, approved, pending, rejected, draft }
  }, [templates])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#ed1b24]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-medium text-gray-900">WhatsApp broadcasting</div>
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
            Throughput: default up to 80 messages/sec (up to 1,000 when upgraded). If you see error 130429, you’re over the limit — wait and retry.{' '}
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/throughput" target="_blank" rel="noopener noreferrer" className="text-[#ed1b24] hover:underline">Throughput</a>
          </p>
        </div>
      </section>
    </div>
  )
}

function BulkWhatsAppTab() {
  const [source, setSource] = useState<'leads' | 'customers' | 'paste'>('leads')
  const [message, setMessage] = useState('')
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
  const [broadcastMode, setBroadcastMode] = useState<'free-text' | 'template'>('free-text')
  const [approvedTemplates, setApprovedTemplates] = useState<WhatsAppTemplate[]>([])
  const [metaTemplates, setMetaTemplates] = useState<Array<{ name: string; language: string; category?: string; body_text?: string; header_text?: string | null }>>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateParamValues, setTemplateParamValues] = useState<string[]>([])
  const [templateHeaderParamValues, setTemplateHeaderParamValues] = useState<string[]>([])

  // Check if Meta WhatsApp API is configured
  useEffect(() => {
    fetch('/api/marketing/whatsapp/config')
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => setApiConfigured(!!data?.configured))
      .catch(() => setApiConfigured(false))
  }, [])

  // Fetch approved templates (from app DB) and from Meta (templates created on Meta dashboard)
  useEffect(() => {
    if (!apiConfigured) return
    Promise.all([
      fetch('/api/marketing/whatsapp/templates?status=approved').then((res) => (res.ok ? res.json() : { templates: [] })),
      fetch('/api/marketing/whatsapp/templates/from-meta').then((res) => (res.ok ? res.json() : { templates: [] })),
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

  // If current selection is a local template whose name exists (or is similar) in Meta, use Meta option (avoids #132001)
  useEffect(() => {
    if (!selectedTemplateId || selectedTemplateId.startsWith('meta:')) return
    const local = approvedTemplates.find((t) => t.id === selectedTemplateId)
    if (!local) return
    const exactMatch = metaTemplates.find((m) => m.name === local.name)
    if (exactMatch) {
      setSelectedTemplateId(`meta:${exactMatch.name}:${exactMatch.language}`)
      return
    }
    // If a Meta template has a very similar name (e.g. "welcome" vs "welcom"), prefer Meta to avoid #132001
    const similarMeta = metaTemplates.find((m) => templateNameSimilar(local.name, m.name))
    if (similarMeta) setSelectedTemplateId(`meta:${similarMeta.name}:${similarMeta.language}`)
  }, [approvedTemplates, metaTemplates, selectedTemplateId])

  // Fetch leads
  useEffect(() => {
    if (source !== 'leads') return
    setLoading(true)
    setLoadError(null)
    fetch('/api/leads')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? 'You don’t have access to leads.' : 'Failed to load leads')
        return res.json()
      })
      .then((data) => {
        const list: LeadRecipient[] = (data.leads || []).map((l: any) => ({
          id: l.id,
          name: l.name || '—',
          phone: l.phone || '',
          type: 'lead',
        })).filter((r: LeadRecipient) => normalizePhone(r.phone).length >= 10)
        setLeads(list)
        setSelectedIds(new Set())
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [source])

  // Fetch customers
  useEffect(() => {
    if (source !== 'customers') return
    setLoading(true)
    setLoadError(null)
    fetch('/api/customers')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? 'You don’t have access to customers.' : 'Failed to load customers')
        return res.json()
      })
      .then((data) => {
        const list: CustomerRecipient[] = (data.customers || []).map((c: any) => ({
          id: c.id,
          name: c.name || '—',
          phone: c.phone || '',
          type: 'customer',
        })).filter((r: CustomerRecipient) => normalizePhone(r.phone).length >= 10)
        setCustomers(list)
        setSelectedIds(new Set())
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false))
  }, [source])

  // Pasted numbers: one per line, optional "name, number" or just number
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
      (r) =>
        r.name.toLowerCase().includes(q) || normalizePhone(r.phone).includes(q.replace(/\D/g, ''))
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

  const sendViaApi = async () => {
    if (!message.trim() || count === 0) return
    setSending(true)
    setSendResult(null)
    const BATCH_SIZE = 100
    const recipients = selectedRecipients.map((r) => ({ phone: r.phone, name: r.name }))
    const batches: typeof recipients[] = []
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      batches.push(recipients.slice(i, i + BATCH_SIZE))
    }
    let totalSent = 0
    let totalFailed = 0
    const allResults: SendResult['results'] = []
    try {
      for (const batch of batches) {
        const res = await fetch('/api/marketing/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: batch,
            message: message.trim(),
            defaultCountryCode: '91',
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          batch.forEach((r) => {
            allResults.push({ phone: r.phone, success: false, error: data?.error || data?.detail || `HTTP ${res.status}` })
            totalFailed++
          })
          continue
        }
        totalSent += data.sent ?? 0
        totalFailed += data.failed ?? 0
        if (Array.isArray(data.results)) allResults.push(...data.results)
      }
      setSendResult({ sent: totalSent, failed: totalFailed, results: allResults })
    } catch (e) {
      setSendResult({
        sent: 0,
        failed: count,
        results: selectedRecipients.map((r) => ({
          phone: r.phone,
          success: false,
          error: e instanceof Error ? e.message : 'Request failed',
        })),
      })
    } finally {
      setSending(false)
    }
  }

  const openFirstInWhatsApp = () => {
    const first = selectedRecipients[0]
    if (!first) return
    const url = buildWhatsAppUrl(first.phone, message)
    if (url) window.open(url, '_blank')
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
  /** Resolved template for param counts: from Meta list (with body_text/header_text) or local approved. */
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
    const BATCH_SIZE = 100
    const recipients = selectedRecipients.map((r) => ({ phone: r.phone, name: r.name }))
    const bodyParameters = templateParamCount > 0 ? templateParamValues.slice(0, templateParamCount) : undefined
    const headerParameters = templateHeaderParamCount > 0 ? templateHeaderParamValues.slice(0, templateHeaderParamCount) : undefined
    const payload: Record<string, unknown> = {
      recipients: [],
      bodyParameters,
      headerParameters,
      defaultCountryCode: '91',
    }
    if (isMetaTemplate && selectedMetaTemplate) {
      payload.templateName = selectedMetaTemplate.name
      payload.templateLanguage = selectedMetaTemplate.language
    } else {
      payload.templateId = selectedTemplateId
    }
    let totalSent = 0
    let totalFailed = 0
    const allResults: SendResult['results'] = []
    try {
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE)
        payload.recipients = batch
        const res = await fetch('/api/marketing/whatsapp/send-template', {
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
    } catch (e) {
      setSendResult({
        sent: 0,
        failed: count,
        results: selectedRecipients.map((r) => ({
          phone: r.phone,
          success: false,
          error: e instanceof Error ? e.message : 'Request failed',
        })),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Source */}
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

      {/* Recipients list or paste area */}
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
              <button
                type="button"
                onClick={selectAll}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
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

      {/* Message or template */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {apiConfigured && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setBroadcastMode('free-text'); clearSendResult() }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${broadcastMode === 'free-text' ? 'border-[#ed1b24] bg-red-50 text-[#ed1b24]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Free text message
            </button>
            <button
              type="button"
              onClick={() => { setBroadcastMode('template'); clearSendResult() }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${broadcastMode === 'template' ? 'border-[#ed1b24] bg-red-50 text-[#ed1b24]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Template broadcast
            </button>
          </div>
        )}
        {broadcastMode === 'template' && apiConfigured ? (
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
                {/* Prefer Meta options when same name exists so language matches exactly (avoids #132001) */}
                {metaTemplates.map((t) => (
                  <option key={`meta:${t.name}:${t.language}`} value={`meta:${t.name}:${t.language}`}>
                    {t.name} ({t.language}) — from Meta
                  </option>
                ))}
                {/* Local approved only when Meta has no exact or similar name (avoids typo mismatch #132001) */}
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
                <p className="mt-1 text-xs text-amber-600">No templates. Create one in the Message templates tab or add in Meta WhatsApp dashboard, then sync.</p>
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
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {apiConfigured ? 'Message (required for sending via API)' : 'Message (optional — pre-fill when opening WhatsApp)'}
            </label>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); clearSendResult() }}
              placeholder={apiConfigured ? 'Type your message. It will be sent via Meta WhatsApp API.' : 'Type your message here. It will open in WhatsApp with this text pre-filled.'}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#ed1b24] focus:outline-none focus:ring-1 focus:ring-[#ed1b24]"
            />
          </>
        )}
      </div>

      {/* Send result summary */}
      {sendResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-green-600">{sendResult.sent} sent</span>
              {sendResult.failed > 0 && (
                <span className="text-red-600 font-semibold ml-2">{sendResult.failed} failed</span>
              )}
            </p>
            <button type="button" onClick={clearSendResult} className="text-sm text-gray-500 hover:text-gray-700 underline">
              Dismiss
            </button>
          </div>
          {sendResult.failed > 0 && (() => {
            const hasAllowedListError = sendResult.results.some(
              (r) => r.error && (r.error.includes('131030') || r.error.toLowerCase().includes('not in allowed list'))
            )
            const hasReengagementError = sendResult.results.some(
              (r) => r.error && (/re-engagement|template required|24.?hour|approved template/i.test(r.error))
            )
            return (
              <>
                {hasAllowedListError && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    <p className="font-medium">Recipient not in allowed list</p>
                    <p className="mt-1 text-amber-700">
                      In Development mode, Meta WhatsApp API only allows sending to numbers you add in the dashboard.
                      Add this number in <strong>Meta for Developers → Your App → WhatsApp → API Setup</strong> under
                      &quot;To&quot; / recipient allowlist, then try again. For production, submit your app for review to message any number.
                    </p>
                  </div>
                )}
                {hasReengagementError && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    <p className="font-medium">Use a template message</p>
                    <p className="mt-1 text-amber-700">
                      The recipient has not messaged you in the last 24 hours. Use <strong>Template broadcast</strong> with an approved template instead of free text.
                    </p>
                  </div>
                )}
                {sendResult.results.some((r) => r.error && (r.error.includes('132001') || r.error.includes('translation'))) && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    <p className="font-medium">Template or language mismatch (#132001)</p>
                    <p className="mt-1 text-amber-700">
                      Sent template <strong>&quot;{(selectedMetaTemplate ?? selectedTemplate)?.name ?? '?'}&quot;</strong> ({selectedMetaTemplate?.language ?? selectedTemplate?.language ?? '?'}). Meta says it doesn’t exist in that language — name and language must match Meta exactly. Pick an option labeled <strong>&quot;— from Meta&quot;</strong> (e.g. welcome (en_US) — from Meta), or go to <strong>Message templates</strong> → <strong>Sync</strong>, then choose the same &quot;— from Meta&quot; option again.
                    </p>
                  </div>
                )}
                {sendResult.results.some((r) => !r.success && r.metaResponse != null) && (
                  <div className="mt-3 p-3 rounded-lg bg-gray-100 border border-gray-200 text-xs">
                    <p className="font-medium text-gray-800 mb-1">Meta API response (for debugging)</p>
                    <pre className="whitespace-pre-wrap break-all text-gray-700">
                      {JSON.stringify(
                        sendResult.results.find((r) => !r.success && r.metaResponse != null)?.metaResponse,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
                <ul className="mt-3 max-h-32 overflow-y-auto space-y-1 text-xs text-red-700">
                  {sendResult.results.filter((r) => !r.success).map((r, i) => (
                    <li key={i}>{r.phone}: {r.error ?? 'Failed'}</li>
                  ))}
                </ul>
              </>
            )
          })()}
        </div>
      )}

      {/* Actions */}
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
            broadcastMode === 'template' ? (
              <button
                type="button"
                onClick={sendTemplateViaApi}
                disabled={count === 0 || !selectedTemplateId || sending || (templateParamCount > 0 && templateParamValues.slice(0, templateParamCount).some((v) => !v?.trim())) || (templateHeaderParamCount > 0 && templateHeaderParamValues.slice(0, templateHeaderParamCount).some((v) => !v?.trim()))}
                className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#20BA5A] disabled:opacity-50 disabled:pointer-events-none"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending…' : 'Send template broadcast'}
              </button>
            ) : (
              <button
                type="button"
                onClick={sendViaApi}
                disabled={count === 0 || !message.trim() || sending}
                className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#20BA5A] disabled:opacity-50 disabled:pointer-events-none"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending…' : 'Send via WhatsApp API'}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={openFirstInWhatsApp}
              disabled={count === 0}
              className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#20BA5A] disabled:opacity-50 disabled:pointer-events-none"
            >
              <Send className="h-4 w-4" />
              Open first in WhatsApp
            </button>
          )}
        </div>
      </div>

      {apiConfigured === false && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Meta WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in your server environment to send messages via API. Until then, use &quot;Open first in WhatsApp&quot; or the links below.
        </p>
      )}

      {/* Why wasn't my message received? */}
      <details className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100">
          Message not received? Check these
        </summary>
        <ul className="px-4 pb-3 pt-1 text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li><strong>Development mode:</strong> Add the recipient&apos;s number to the allowlist in Meta for Developers → WhatsApp → API Setup (&quot;To&quot;).</li>
          <li><strong>Free text</strong> only works if the recipient messaged you in the last 24 hours. Otherwise use <strong>Template broadcast</strong> with an approved template.</li>
          <li><strong>Phone number:</strong> Use full number with country code (e.g. 91 for India). In .env use the <strong>Phone number ID</strong> from API Setup (e.g. 1038327846024239), not the business account ID.</li>
          <li>If the UI shows &quot;X failed&quot;, expand the list above and fix the error (allowlist, template, or number format).</li>
        </ul>
      </details>

      {/* List of selected: open each in WhatsApp (fallback / manual) */}
      {count > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">Open individual chats</h3>
            <p className="text-xs text-gray-500 mt-0.5">Click to open each contact in WhatsApp (with message pre-filled)</p>
          </div>
          <ul className="max-h-[240px] overflow-y-auto divide-y divide-gray-100">
            {selectedRecipients.map((r) => {
              const url = buildWhatsAppUrl(r.phone, message)
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

// ---------- Message templates (design → submit to Meta → use in broadcast) ----------

function normalizePhoneForChat(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

interface ChatMessage {
  id: string
  lead_id: string | null
  phone: string
  direction: 'out' | 'in'
  body: string
  meta_message_id: string | null
  created_at: string
}

function ChatWithLeadsTab() {
  const [leads, setLeads] = useState<LeadRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<LeadRecipient | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [search, setSearch] = useState('')
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    fetch('/api/marketing/whatsapp/config')
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => setApiConfigured(!!data?.configured))
      .catch(() => setApiConfigured(false))
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch('/api/leads')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? 'You don’t have access to leads.' : 'Failed to load leads')
        return res.json()
      })
      .then((data) => {
        const list: LeadRecipient[] = (data.leads || []).map((l: any) => ({
          id: l.id,
          name: l.name || '—',
          phone: l.phone || '',
          type: 'lead',
        })).filter((r: LeadRecipient) => normalizePhoneForChat(r.phone).length >= 10)
        setLeads(list)
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false))
  }, [])

  const fetchMessages = useCallback((leadId: string, phone: string) => {
    setLoadingMessages(true)
    setMessagesError(null)
    const params = new URLSearchParams({ leadId, phone })
    fetch(`/api/marketing/whatsapp/chat?${params}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d?.error || res.statusText) })
        return res.json()
      })
      .then((data) => setMessages(data.messages || []))
      .catch((err) => {
        setMessages([])
        setMessagesError(err?.message || 'Could not load messages')
      })
      .finally(() => setLoadingMessages(false))
  }, [])

  useEffect(() => {
    if (!selectedLead) {
      setMessages([])
      return
    }
    fetchMessages(selectedLead.id, selectedLead.phone)
  }, [selectedLead?.id, selectedLead?.phone, fetchMessages])

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads
    const q = search.toLowerCase()
    return leads.filter((l) => l.name.toLowerCase().includes(q) || l.phone.includes(q))
  }, [leads, search])

  const handleSend = async () => {
    if (!selectedLead || !message.trim() || sending) return
    const text = message.trim()
    setSending(true)
    setSendStatus('idle')
    setMessage('')
    const lastIncoming = [...messages].filter((m) => m.direction === 'in').pop()
    const contextMessageId = lastIncoming?.meta_message_id ?? undefined
    try {
      const res = await fetch('/api/marketing/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipients: [{ phone: selectedLead.phone, name: selectedLead.name }],
          message: text,
          defaultCountryCode: '91',
          leadId: selectedLead.id,
          ...(contextMessageId && { contextMessageId }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendStatus('error')
        setMessage(text)
        return
      }
      setSendStatus('success')
      if (data.message) setMessages((prev) => [...prev, data.message])
      fetchMessages(selectedLead.id, selectedLead.phone)
    } catch {
      setSendStatus('error')
      setMessage(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex flex-col md:flex-row h-[calc(100vh-14rem)] min-h-[420px]">
        {/* Lead list */}
        <div className="w-full md:w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] outline-none transition"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No leads with valid phone numbers.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedLead(lead); setSendStatus('idle'); setMessagesError(null) }}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                        selectedLead?.id === lead.id ? 'bg-[#25D366]/10 border-l-2 border-[#25D366]' : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-[#25D366]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{lead.name}</p>
                        <p className="text-xs text-gray-500 truncate">{lead.phone}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-[#e5ddd5]/30 min-h-[280px]">
          {!apiConfigured ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-gray-500 text-sm">
              WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to chat with leads.
            </div>
          ) : !selectedLead ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Select a lead to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-[#25D366]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{selectedLead.name}</p>
                  <p className="text-xs text-gray-500 truncate">{selectedLead.phone}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 min-h-0">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#25D366]" />
                  </div>
                ) : messagesError ? (
                  <p className="text-xs text-amber-600 text-center py-4">{messagesError}. Ensure database migration 019 (whatsapp_messages) has been run.</p>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No messages yet. Say hi — messages you send and lead replies will appear here.</p>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${
                            msg.direction === 'out'
                              ? 'bg-[#D9FDD3] text-gray-900 rounded-br-md'
                              : 'bg-white text-gray-900 rounded-bl-md border border-gray-200'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                          <p className={`text-[10px] mt-0.5 ${msg.direction === 'out' ? 'text-gray-500' : 'text-gray-400'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <div className="p-3 bg-white border-t border-gray-200">
                <div className="flex gap-2">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Type a message..."
                    rows={2}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-[#25D366]/30 focus:border-[#25D366] outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!message.trim() || sending}
                    className="shrink-0 rounded-xl bg-[#25D366] text-white p-2.5 hover:bg-[#20bd5a] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
                {sendStatus === 'success' && <p className="text-xs text-green-600 mt-1">Sent</p>}
                {sendStatus === 'error' && <p className="text-xs text-red-600 mt-1">Failed to send. Check WhatsApp config and phone number.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface WhatsAppTemplate {
  id: string
  name: string
  language: string
  category: string
  body_text: string
  header_text: string | null
  footer_text: string | null
  header_format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_media_url?: string | null
  buttons?: Array<{ type: string; text: string; example?: string }> | null
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  meta_id: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

interface LibraryTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  body_text: string
  header_format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_text: string | null
  footer_text: string | null
  buttons: Array<{ type: string; text: string; example?: string }>
}

function TemplatesTab() {
  const [templatesSubTab, setTemplatesSubTab] = useState<'my-templates' | 'library'>('my-templates')
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [metaOnlyTemplates, setMetaOnlyTemplates] = useState<Array<{ name: string; language: string; category?: string }>>([])
  const [libraryTemplates, setLibraryTemplates] = useState<LibraryTemplate[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING')
  const [formLanguage, setFormLanguage] = useState('en')
  const [formBody, setFormBody] = useState('')
  const [formHeader, setFormHeader] = useState('')
  const [formFooter, setFormFooter] = useState('')
  const [formHeaderFormat, setFormHeaderFormat] = useState<'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('TEXT')
  const [formHeaderMediaUrl, setFormHeaderMediaUrl] = useState('')
  const [formHeaderPreviewUrl, setFormHeaderPreviewUrl] = useState('')
  const [formHeaderUploading, setFormHeaderUploading] = useState(false)
  const headerPreviewUrlRef = useRef<string | null>(null)
  const [formButtons, setFormButtons] = useState<Array<{ type: string; text: string; example?: string }>>([])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showWabaHelp, setShowWabaHelp] = useState(false)
  const [discoverResult, setDiscoverResult] = useState<{ wabaId?: string; wabaIds?: string[]; error?: string } | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  const fetchTemplates = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/marketing/whatsapp/templates').then((res) => (res.ok ? res.json() : { templates: [] })),
      fetch('/api/marketing/whatsapp/templates/from-meta').then((res) => (res.ok ? res.json() : { templates: [] })),
    ])
      .then(([local, meta]) => {
        setTemplates(local.templates || [])
        const localSet = new Set((local.templates || []).map((t: WhatsAppTemplate) => `${t.name}:${t.language}`))
        const metaOnly = (meta.templates || []).filter(
          (m: { name: string; language: string }) => !localSet.has(`${m.name}:${m.language}`)
        )
        setMetaOnlyTemplates(metaOnly)
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTemplates() }, [])

  const fetchLibrary = useCallback(() => {
    setLibraryLoading(true)
    setLibraryError(null)
    fetch('/api/marketing/whatsapp/templates/library')
      .then((res) => (res.ok ? res.json() : { templates: [], error: 'Failed to load' }))
      .then((data) => {
        setLibraryTemplates(data.templates || [])
        if (data.error) setLibraryError(data.error)
      })
      .catch(() => { setLibraryTemplates([]); setLibraryError('Could not load template library') })
      .finally(() => setLibraryLoading(false))
  }, [])

  useEffect(() => {
    if (templatesSubTab === 'library') fetchLibrary()
  }, [templatesSubTab, fetchLibrary])

  const openFormFromLibrary = (lib: LibraryTemplate) => {
    const cat = (lib.category?.toUpperCase() === 'UTILITY' || lib.category?.toUpperCase() === 'AUTHENTICATION')
      ? lib.category.toUpperCase() as 'UTILITY' | 'AUTHENTICATION'
      : 'MARKETING'
    setFormName(`${lib.name}_copy`)
    setFormCategory(cat)
    setFormLanguage(lib.language)
    setFormBody(lib.body_text)
    setFormHeader(lib.header_text ?? '')
    setFormFooter(lib.footer_text ?? '')
    setFormHeaderFormat(lib.header_format ?? 'TEXT')
    if (headerPreviewUrlRef.current) {
      URL.revokeObjectURL(headerPreviewUrlRef.current)
      headerPreviewUrlRef.current = null
    }
    setFormHeaderMediaUrl('')
    setFormHeaderPreviewUrl('')
    setFormButtons(lib.buttons?.length ? lib.buttons.map((b) => ({ type: b.type, text: b.text, example: b.example })) : [])
    setFormError(null)
    setEditingTemplateId(null)
    setShowForm(true)
    setTemplatesSubTab('my-templates')
  }

  const openFormForEdit = (t: WhatsAppTemplate) => {
    if (headerPreviewUrlRef.current) {
      URL.revokeObjectURL(headerPreviewUrlRef.current)
      headerPreviewUrlRef.current = null
    }
    setFormHeaderPreviewUrl('')
    setFormName(t.name)
    setFormCategory(t.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION')
    setFormLanguage(t.language)
    setFormBody(t.body_text)
    setFormHeader(t.header_text ?? '')
    setFormFooter(t.footer_text ?? '')
    setFormHeaderFormat((t.header_format as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT') ?? 'TEXT')
    setFormHeaderMediaUrl(t.header_media_url ?? '')
    setFormButtons(Array.isArray(t.buttons) && t.buttons.length > 0
      ? t.buttons.map((b) => ({ type: b.type, text: b.text, example: b.example }))
      : [])
    setFormError(null)
    setEditingTemplateId(t.id)
    setShowForm(true)
  }

  const handleDeleteTemplate = (id: string) => {
    setDeletingId(id)
    fetch(`/api/marketing/whatsapp/templates/${id}`, { method: 'DELETE', credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error)
          if (/100|permission|WhatsApp Business Account/i.test(String(data.error))) setPermissionError(String(data.error))
        } else {
          setDeleteConfirmId(null)
          fetchTemplates()
        }
      })
      .finally(() => setDeletingId(null))
  }

  const handleSync = () => {
    setSyncing(true)
    setDiscoverResult(null)
    setPermissionError(null)
    fetch('/api/marketing/whatsapp/templates/sync', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          const msg = data.detail ? `${data.error}\n\n${data.detail}` : data.error
          alert(msg)
          setShowWabaHelp(true)
          if (/100|permission|WhatsApp Business Account/i.test(String(data.error))) setPermissionError(String(data.error))
        } else {
          setPermissionError(null)
          fetchTemplates()
        }
      })
      .finally(() => setSyncing(false))
  }

  const handleDiscoverWaba = () => {
    setDiscovering(true)
    setDiscoverResult(null)
    fetch('/api/marketing/whatsapp/waba-discover')
      .then((res) => res.json())
      .then(setDiscoverResult)
      .finally(() => setDiscovering(false))
  }

  const handleSubmitToMeta = (id: string) => {
    setSubmittingId(id)
    setSubmitError(null)
    fetch(`/api/marketing/whatsapp/templates/${id}/submit`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          let msg = data.error
          if (data.detail) msg += `\n\n${data.detail}`
          if (data.currentStatus) msg += `\n(Current status: ${data.currentStatus})`
          if (data.reason === 'status_not_draft') msg += '\n\nOnly draft templates can be submitted. Create a new template or use one that is still in draft.'
          setSubmitError(msg)
          alert('Submit failed. See the message below for details.')
          if (/100|permission|WhatsApp Business Account/i.test(String(data.error))) setPermissionError(String(data.error))
        } else {
          setSubmitError(null)
          setPermissionError(null)
          fetchTemplates()
        }
      })
      .finally(() => setSubmittingId(null))
  }

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormSaving(true)
    const payload: Record<string, unknown> = {
      name: formName.trim() || 'template',
      category: formCategory,
      language: formLanguage,
      body_text: formBody.trim(),
      footer_text: formFooter.trim() || null,
      header_format: formHeaderFormat,
      header_text: formHeaderFormat === 'TEXT' ? (formHeader.trim() || null) : null,
      header_media_url: (formHeaderFormat !== 'TEXT' && formHeaderMediaUrl.trim()) ? formHeaderMediaUrl.trim() : null,
      buttons: formButtons.filter((b) => b.text.trim()).map((b) => ({
        type: b.type,
        text: b.text.trim(),
        ...(b.example?.trim() && { example: b.example.trim() }),
      })),
    }
    const url = editingTemplateId
      ? `/api/marketing/whatsapp/templates/${editingTemplateId}`
      : '/api/marketing/whatsapp/templates'
    const method = editingTemplateId ? 'PATCH' : 'POST'
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setFormError(data.error)
        else {
          if (headerPreviewUrlRef.current) {
            URL.revokeObjectURL(headerPreviewUrlRef.current)
            headerPreviewUrlRef.current = null
          }
          setShowForm(false)
          setEditingTemplateId(null)
          setFormName('')
          setFormBody('')
          setFormHeader('')
          setFormFooter('')
          setFormHeaderFormat('TEXT')
          setFormHeaderMediaUrl('')
          setFormHeaderPreviewUrl('')
          setFormButtons([])
          fetchTemplates()
        }
      })
      .finally(() => setFormSaving(false))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* <p className="text-sm text-gray-600">
          Design message templates, submit for Meta review, then use approved templates for bulk broadcast. For GIF headers, marketing TTL (12h–30d), benchmarks and recommendations, see{' '}
          <a href="https://developers.facebook.com/docs/whatsapp/marketing-messages-api-for-whatsapp/features/" target="_blank" rel="noopener noreferrer" className="text-[#ed1b24] hover:underline">Marketing Messages API for WhatsApp</a>.
        </p> */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync status from Meta
          </button>
          <button
            type="button"
            onClick={() => {
              if (showForm) setShowForm(false)
              else { setEditingTemplateId(null); setShowForm(true) }
            }}
            className="rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e]"
          >
            {showForm ? 'Cancel' : 'Create template'}
          </button>
          <button
            type="button"
            onClick={() => setShowWabaHelp(!showWabaHelp)}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            {showWabaHelp ? 'Hide' : 'Find your WABA ID'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTemplatesSubTab('my-templates')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            templatesSubTab === 'my-templates' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="h-4 w-4" />
          My templates
        </button>
        <button
          type="button"
          onClick={() => setTemplatesSubTab('library')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            templatesSubTab === 'library' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Template library
        </button>
      </div>

      {templatesSubTab === 'library' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-sm text-gray-600">Templates in your account (from Meta). Preview and clone to edit as a new draft.</p>
              <button
                type="button"
                onClick={fetchLibrary}
                disabled={libraryLoading}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {libraryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>
            {libraryError && <p className="text-sm text-amber-600 mb-3">{libraryError}</p>}
            {libraryLoading && libraryTemplates.length === 0 ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#ed1b24]" /></div>
            ) : libraryTemplates.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No templates in your account yet. Add templates in WhatsApp Manager or create custom ones in My templates.</p>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {libraryTemplates.map((lib) => (
                <div key={`${lib.id}-${lib.name}-${lib.language}`} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-medium text-gray-900">{lib.name}</p>
                      <p className="text-xs text-gray-500">{getLanguageName(lib.language)} · {lib.category}</p>
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                        lib.status === 'approved' || lib.status === 'active' ? 'bg-green-100 text-green-800' :
                        lib.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                        lib.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {lib.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openFormFromLibrary(lib)}
                      className="shrink-0 rounded-lg border border-[#ed1b24] px-3 py-1.5 text-sm font-medium text-[#ed1b24] hover:bg-red-50"
                    >
                      Edit (clone)
                    </button>
                  </div>
                  <div className="mt-auto">
                    <TemplatePreview
                      headerFormat={lib.header_format ?? 'TEXT'}
                      headerText={lib.header_text ?? ''}
                      headerMediaUrl=""
                      body={lib.body_text}
                      footer={lib.footer_text ?? ''}
                      buttons={lib.buttons?.filter((b) => b.text) ?? []}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      {templatesSubTab === 'my-templates' && (
        <>
      {showWabaHelp && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h4 className="font-medium text-amber-900">Find your WhatsApp Business Account ID</h4>
          <p className="text-sm text-amber-800">
            Sync and &quot;Submit for review&quot; need the <strong>WhatsApp Business Account ID</strong>, not the App ID or Phone Number ID.
          </p>
          <div>
            <button
              type="button"
              onClick={handleDiscoverWaba}
              disabled={discovering}
              className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {discovering ? 'Checking…' : 'Try discover from current ID'}
            </button>
            {discoverResult && (
              <div className="mt-2 text-sm">
                {discoverResult.wabaId ? (
                  <p className="text-green-800">
                    Use this in <code className="bg-white px-1 rounded">.env.local</code>:{' '}
                    <code className="bg-white px-1 rounded font-mono">WHATSAPP_BUSINESS_ACCOUNT_ID={discoverResult.wabaId}</code>
                  </p>
                ) : discoverResult.error && (
                  <p className="text-amber-700">{discoverResult.error}</p>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-amber-800">
            <strong>Or find it manually:</strong> Go to{' '}
            <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">business.facebook.com</a>
            {' '}→ Settings (gear) → Accounts → WhatsApp Accounts → click your account. The numeric <strong>Account ID</strong> is your WABA ID.
          </p>
        </div>
      )}

      {submitError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-amber-900">Submit for review failed</h4>
            <button type="button" onClick={() => setSubmitError(null)} className="text-amber-700 hover:text-amber-900 text-sm shrink-0">Dismiss</button>
          </div>
          <p className="mt-2 text-sm text-amber-800 whitespace-pre-wrap">{submitError}</p>
        </div>
      )}

      {(showWabaHelp || permissionError || libraryError?.includes('100') || libraryError?.toLowerCase().includes('permission')) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-blue-900">If you see &quot;#100) Need permission on WhatsApp Business Account&quot;</h4>
            <button type="button" onClick={() => setPermissionError(null)} className="text-blue-600 hover:text-blue-800 text-sm shrink-0">Dismiss</button>
          </div>
          <p className="text-sm text-blue-800">
            This means your <strong>access token</strong> does not have the right permissions, or the app is not linked to the business that owns the WhatsApp account.
          </p>
          <ol className="text-sm text-blue-800 list-decimal list-inside space-y-2">
            <li>
              <strong>Use a System User token</strong> with <code className="bg-white/80 px-1 rounded">whatsapp_business_management</code> (for templates) and <code className="bg-white/80 px-1 rounded">whatsapp_business_messaging</code> (for sending). In Meta Business Suite → Business settings → Users → System users → Add assets → generate token for your app and select these permissions.
            </li>
            <li>
              <strong>Link the app to the correct Business:</strong> The WhatsApp Business Account must be owned by or shared with the same Meta Business that has your app. In Business settings → Accounts → WhatsApp Accounts, ensure the WABA is under the business where your app is registered.
            </li>
            <li>
              <strong>Use the WABA ID, not the Business ID:</strong> <code className="bg-white/80 px-1 rounded">WHATSAPP_BUSINESS_ACCOUNT_ID</code> must be the <strong>WhatsApp Business Account ID</strong> (from WhatsApp Accounts), not the Meta Business ID.
            </li>
          </ol>
          <p className="text-sm text-blue-800">
            <a href="https://developers.facebook.com/docs/whatsapp/access-tokens/" target="_blank" rel="noopener noreferrer" className="underline">Meta: Access tokens</a>
            {' · '}
            <a href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started/" target="_blank" rel="noopener noreferrer" className="underline">Business Management API</a>
          </p>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm transition-all duration-300 ease-out">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">{editingTemplateId ? 'Edit template' : 'New message template'}</h3>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name (lowercase, underscores only)</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. welcome_offer"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as typeof formCategory)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="MARKETING">MARKETING</option>
                    <option value="UTILITY">UTILITY</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                  <select
                    value={formLanguage}
                    onChange={(e) => setFormLanguage(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {META_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Header type</label>
                <select
                  value={formHeaderFormat}
                  onChange={(e) => setFormHeaderFormat(e.target.value as typeof formHeaderFormat)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="TEXT">Text</option>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </div>
              {formHeaderFormat === 'TEXT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header text (optional, max 60 chars; you can use {"{{1}}"} etc.)</label>
                  <input
                    type="text"
                    value={formHeader}
                    onChange={(e) => setFormHeader(e.target.value)}
                    maxLength={60}
                    placeholder="e.g. Hello {{1}}"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              {(formHeaderFormat === 'IMAGE' || formHeaderFormat === 'VIDEO' || formHeaderFormat === 'DOCUMENT') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload {formHeaderFormat.toLowerCase()} for Meta (required for template review)
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 cursor-pointer disabled:opacity-50">
                    <input
                      type="file"
                      accept={formHeaderFormat === 'IMAGE' ? 'image/jpeg,image/png,image/gif,image/webp' : formHeaderFormat === 'VIDEO' ? 'video/mp4,video/x-m4v' : 'application/pdf'}
                      className="sr-only"
                      disabled={formHeaderUploading}
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (headerPreviewUrlRef.current) {
                          URL.revokeObjectURL(headerPreviewUrlRef.current)
                          headerPreviewUrlRef.current = null
                        }
                        const objectUrl = URL.createObjectURL(f)
                        headerPreviewUrlRef.current = objectUrl
                        setFormHeaderPreviewUrl(objectUrl)
                        setFormHeaderUploading(true)
                        setFormError(null)
                        const fd = new FormData()
                        fd.append('file', f)
                        try {
                          const res = await fetch('/api/marketing/whatsapp/upload-media', { method: 'POST', body: fd, credentials: 'include' })
                          const data = await res.json()
                          if (data.handle) setFormHeaderMediaUrl(data.handle)
                          else setFormError(data.error ?? 'Upload failed')
                        } catch (err) {
                          setFormError(err instanceof Error ? err.message : 'Upload failed')
                        } finally {
                          setFormHeaderUploading(false)
                          e.target.value = ''
                        }
                      }}
                    />
                    {formHeaderUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {formHeaderUploading ? 'Uploading…' : `Choose ${formHeaderFormat.toLowerCase()} file`}
                  </label>
                  {formHeaderMediaUrl && (
                    <p className="mt-1.5 text-xs text-green-600">Uploaded to Meta ✓</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body (use {"{{1}}"}, {"{{2}}"} for variables)</label>
                <p className="text-xs text-gray-500 mb-1.5">
                  Variables: type {"{{1}}"}, {"{{2}}"}, {"{{3}}"} etc. in the body (and optionally in a TEXT header). When sending, you fill value for {"{{1}}"}, {"{{2}}"}, … in order. Example: &quot;Hi {"{{1}}"}, your order {"{{2}}"} is ready.&quot; → you provide [name, order_id].
                </p>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Hello {{1}}, your exclusive offer is ready!"
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Footer (optional, max 60 chars)</label>
                <input
                  type="text"
                  value={formFooter}
                  onChange={(e) => setFormFooter(e.target.value)}
                  maxLength={60}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Buttons (CTA) – max 10</label>
                  <button
                    type="button"
                    onClick={() => setFormButtons((b) => [...b, { type: 'QUICK_REPLY', text: '', example: '' }])}
                    className="text-xs text-[#ed1b24] hover:underline"
                  >
                    + Add button
                  </button>
                </div>
                {formButtons.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded bg-gray-50">
                    <select
                      value={b.type}
                      onChange={(e) => setFormButtons((prev) => prev.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="QUICK_REPLY">Quick reply</option>
                      <option value="URL">URL</option>
                      <option value="PHONE_NUMBER">Call</option>
                      <option value="COPY_CODE">Copy code</option>
                    </select>
                    <input
                      type="text"
                      value={b.text}
                      onChange={(e) => setFormButtons((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      placeholder="Button text"
                      maxLength={25}
                      className="flex-1 min-w-[80px] rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    {(b.type === 'URL' || b.type === 'PHONE_NUMBER' || b.type === 'COPY_CODE') && (
                      <input
                        type="text"
                        value={b.example ?? ''}
                        onChange={(e) => setFormButtons((prev) => prev.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))}
                        placeholder={b.type === 'URL' ? 'https://...' : b.type === 'PHONE_NUMBER' ? '+91...' : 'CODE'}
                        className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    )}
                    <button type="button" onClick={() => setFormButtons((prev) => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-600 text-sm">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="submit"
                disabled={!formBody.trim() || formSaving}
                className="rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e] disabled:opacity-50"
              >
                {formSaving ? 'Saving…' : editingTemplateId ? 'Save changes' : 'Save draft'}
              </button>
            </form>
            <div className="lg:sticky lg:top-4 h-fit">
              <p className="text-sm font-medium text-gray-700 mb-2">Live preview</p>
              <TemplatePreview
                headerFormat={formHeaderFormat}
                headerText={formHeader}
                headerMediaUrl={formHeaderMediaUrl}
                headerPreviewUrl={formHeaderPreviewUrl}
                body={formBody}
                footer={formFooter}
                buttons={formButtons.filter((b) => b.text.trim())}
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-medium text-gray-900">Templates</div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#ed1b24]" /></div>
        ) : templates.length === 0 && metaOnlyTemplates.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No templates yet. Create one above or add in Meta WhatsApp dashboard, then click Sync.</div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {templates.map((t) => (
                <li key={t.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-gray-900">{t.name}</span>
                    <span className="text-gray-500 text-sm ml-2">({getLanguageName(t.language)})</span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100">{t.category}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      t.status === 'approved' ? 'bg-green-100 text-green-800' :
                      t.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                      t.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(t)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </button>
                    {t.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => openFormForEdit(t)}
                        className="rounded-lg border border-[#ed1b24] px-3 py-1.5 text-sm font-medium text-[#ed1b24] hover:bg-red-50 inline-flex items-center gap-1.5"
                        title="Edit"
                      >
                        <FileEdit className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                    {deleteConfirmId === t.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.id)}
                          disabled={!!deletingId}
                          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingId === t.id ? 'Deleting…' : 'Yes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(t.id)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 inline-flex items-center gap-1.5"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    )}
                    {t.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => handleSubmitToMeta(t.id)}
                        disabled={!!submittingId}
                        className="rounded-lg border border-[#ed1b24] px-3 py-1.5 text-sm font-medium text-[#ed1b24] hover:bg-red-50 disabled:opacity-50"
                      >
                        {submittingId === t.id ? 'Submitting…' : 'Submit for review'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {metaOnlyTemplates.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  From Meta (created in WhatsApp dashboard)
                </div>
                <ul className="divide-y divide-gray-100">
                  {metaOnlyTemplates.map((m) => (
                    <li key={`${m.name}:${m.language}`} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-gray-900">{m.name}</span>
                        <span className="text-gray-500 text-sm ml-2">({getLanguageName(m.language)})</span>
                        {m.category && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100">{m.category}</span>
                        )}
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">approved</span>
                      </div>
                      <span className="text-xs text-gray-400">Use in Bulk WhatsApp</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPreviewTemplate(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Template preview</h3>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-2">{previewTemplate.name} · {getLanguageName(previewTemplate.language)}</p>
            <TemplatePreview
              headerFormat={(previewTemplate.header_format as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT') ?? 'TEXT'}
              headerText={previewTemplate.header_text ?? ''}
              headerMediaUrl={previewTemplate.header_media_url ?? ''}
              body={previewTemplate.body_text}
              footer={previewTemplate.footer_text ?? ''}
              buttons={previewTemplate.buttons?.filter((b) => b?.text) ?? []}
            />
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
