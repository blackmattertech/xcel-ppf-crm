'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { FileText, RefreshCw, Loader2, Eye, Trash2, FileEdit, Upload, Plus, ArrowLeft } from 'lucide-react'
import { TemplatePreview } from '../_components/TemplatePreview'
import type { WhatsAppTemplate } from '../_lib/types'
import { getLanguageName, META_LANGUAGES } from '../_lib/utils'

/** Parse response body as JSON without throwing on empty or invalid body (e.g. 502/504 HTML or empty). */
async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return { error: res.statusText || 'Empty response' }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { error: res.statusText || 'Invalid response' }
  }
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [metaOnlyTemplates, setMetaOnlyTemplates] = useState<Array<{ name: string; language: string; category?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING')
  const [formSubCategory, setFormSubCategory] = useState<string | null>(null)
  const [formLanguage, setFormLanguage] = useState('en')
  const [formBody, setFormBody] = useState('')
  const [formHeader, setFormHeader] = useState('')
  const [formFooter, setFormFooter] = useState('')
  const [formHeaderFormat, setFormHeaderFormat] = useState<'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('TEXT')
  const [formHeaderMediaUrl, setFormHeaderMediaUrl] = useState('')
  const [formHeaderMediaId, setFormHeaderMediaId] = useState('')
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
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null)
  const [cardMediaUrls, setCardMediaUrls] = useState<Record<string, string>>({})
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('ALL')

  const fetchTemplates = useCallback(() => {
    setLoading(true)
    const categoryParam = categoryFilter !== 'ALL' ? `?category=${encodeURIComponent(categoryFilter)}` : ''
    Promise.all([
      fetch(`/api/marketing/whatsapp/templates${categoryParam}`).then((res) => (res.ok ? parseJsonResponse(res) : Promise.resolve({ templates: [] }))),
      fetch('/api/marketing/whatsapp/templates/from-meta').then((res) => (res.ok ? parseJsonResponse(res) : Promise.resolve({ templates: [] }))),
    ])
      .then(([local, meta]) => {
        const localTemplates = Array.isArray(local.templates) ? local.templates : []
        setTemplates(localTemplates as WhatsAppTemplate[])
        const localSet = new Set(localTemplates.map((t: WhatsAppTemplate) => `${t.name}:${t.language}`))
        const metaTemplates = Array.isArray(meta.templates) ? meta.templates : []
        let metaOnly = metaTemplates.filter(
          (m: { name: string; language: string; category?: string }) => !localSet.has(`${m.name}:${m.language}`)
        )
        if (categoryFilter !== 'ALL') {
          metaOnly = metaOnly.filter((m: { category?: string }) => (m.category ?? '').toUpperCase() === categoryFilter)
        }
        setMetaOnlyTemplates(metaOnly)
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [categoryFilter])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  useEffect(() => {
    const t = previewTemplate as (WhatsAppTemplate & { header_media_id?: string | null }) | null
    if (!t) {
      setPreviewMediaUrl(null)
      return
    }
    const url = (t.header_media_url ?? '').trim()
    if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) {
      setPreviewMediaUrl(url || null)
      return
    }
    if (!t.header_media_id) {
      setPreviewMediaUrl(null)
      return
    }
    setPreviewMediaUrl(null)
    fetch(`/api/marketing/whatsapp/media-url?id=${encodeURIComponent(t.header_media_id)}`, { credentials: 'include' })
      .then((res) => (res.ok ? parseJsonResponse(res) : Promise.resolve(null)))
      .then((data) => data && !('error' in data) && data.url && setPreviewMediaUrl(String(data.url)))
      .catch(() => {})
  }, [previewTemplate?.id, previewTemplate?.header_media_id, previewTemplate?.header_media_url])

  useEffect(() => {
    const needsFetch = templates.filter(
      (t) =>
        (t.header_format === 'IMAGE' || t.header_format === 'VIDEO' || t.header_format === 'DOCUMENT') &&
        (t as { header_media_id?: string }).header_media_id &&
        !/^https?:\/\//i.test((t.header_media_url ?? '').trim())
    )
    if (needsFetch.length === 0) return
    needsFetch.forEach((t) => {
      const id = (t as { header_media_id?: string }).header_media_id
      if (!id) return
      fetch(`/api/marketing/whatsapp/media-url?id=${encodeURIComponent(id)}`, { credentials: 'include' })
        .then((res) => (res.ok ? parseJsonResponse(res) : Promise.resolve(null)))
        .then((data) => {
          if (data && !('error' in data) && data.url) setCardMediaUrls((prev) => ({ ...prev, [t.id]: String(data!.url) }))
        })
        .catch(() => {})
    })
  }, [templates])

  const openFormForEdit = (t: WhatsAppTemplate) => {
    if (headerPreviewUrlRef.current) {
      URL.revokeObjectURL(headerPreviewUrlRef.current)
      headerPreviewUrlRef.current = null
    }
    setFormHeaderPreviewUrl('')
    setFormName(t.name)
    setFormCategory(t.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION')
    setFormSubCategory((t as { sub_category?: string | null }).sub_category ?? null)
    setFormLanguage(t.language)
    setFormBody(t.body_text)
    setFormHeader(t.header_text ?? '')
    setFormFooter(t.footer_text ?? '')
    setFormHeaderFormat((t.header_format as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT') ?? 'TEXT')
    setFormHeaderMediaUrl(t.header_media_url ?? '')
    setFormHeaderMediaId((t as { header_media_id?: string | null }).header_media_id ?? '')
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
      .then((res) => parseJsonResponse(res))
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
      .then((res) => parseJsonResponse(res))
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
      .then((res) => parseJsonResponse(res))
      .then((data) => setDiscoverResult(data as { wabaId?: string; wabaIds?: string[]; error?: string }))
      .finally(() => setDiscovering(false))
  }

  const handleSubmitToMeta = (id: string) => {
    setSubmittingId(id)
    setSubmitError(null)
    fetch(`/api/marketing/whatsapp/templates/${id}/submit`, { method: 'POST' })
      .then((res) => parseJsonResponse(res))
      .then((data) => {
        if (data.error) {
          let msg = String(data.error ?? '')
          if (data.detail) msg += `\n\n${data.detail}`
          if (data.currentStatus) msg += `\n(Current status: ${data.currentStatus})`
          if (data.reason === 'status_not_draft') msg += '\n\nOnly draft templates can be submitted.'
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
    if (formHeaderFormat !== 'TEXT' && (!formHeaderMediaId?.trim() && !formHeaderMediaUrl?.trim())) {
      setFormError('Upload an image/video/document for the header before saving. Click "Choose file" above.')
      return
    }
    setFormSaving(true)
    const payload: Record<string, unknown> = {
      name: formName.trim() || 'template',
      category: formCategory,
      sub_category: formCategory === 'UTILITY' ? formSubCategory : null,
      language: formLanguage,
      body_text: formBody.trim(),
      footer_text: formFooter.trim() || null,
      header_format: formHeaderFormat,
      header_text: formHeaderFormat === 'TEXT' ? (formHeader.trim() || null) : null,
      header_media_url: (formHeaderFormat !== 'TEXT' && formHeaderMediaUrl.trim()) ? formHeaderMediaUrl.trim() : null,
      header_media_id: (formHeaderFormat !== 'TEXT' && formHeaderMediaId.trim()) ? formHeaderMediaId.trim() : null,
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
      .then((res) => parseJsonResponse(res))
      .then((data) => {
        if (data.error) setFormError(String(data.error))
        else {
          if (headerPreviewUrlRef.current) {
            URL.revokeObjectURL(headerPreviewUrlRef.current)
            headerPreviewUrlRef.current = null
          }
          setShowForm(false)
          setEditingTemplateId(null)
          setFormName('')
          setFormSubCategory(null)
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

  const categoryTabs: Array<{ value: 'ALL' | 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'UTILITY', label: 'Utility' },
    { value: 'MARKETING', label: 'Marketing' },
    { value: 'AUTHENTICATION', label: 'Authentication' },
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/marketing/whatsapp"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to WhatsApp
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {categoryTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setCategoryFilter(tab.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  categoryFilter === tab.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync status from Meta
          </button>
          <Link
            href="/marketing/templates/create"
            className="inline-flex items-center gap-2 rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e]"
          >
            <Plus className="h-4 w-4" /> Create template
          </Link>
          <button
            type="button"
            onClick={() => {
              if (showForm) setShowForm(false)
              else { setEditingTemplateId(null); setShowForm(true) }
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {showForm ? 'Cancel' : 'Quick create (legacy)'}
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
                {' '}→ Settings → Accounts → WhatsApp Accounts → click your account. The numeric <strong>Account ID</strong> is your WABA ID.
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

          {(showWabaHelp || permissionError) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-blue-900">If you see &quot;#100) Need permission on WhatsApp Business Account&quot;</h4>
                <button type="button" onClick={() => setPermissionError(null)} className="text-blue-600 hover:text-blue-800 text-sm shrink-0">Dismiss</button>
              </div>
              <p className="text-sm text-blue-800">
                Your <strong>access token</strong> needs the right permissions, or the app must be linked to the business that owns the WhatsApp account.
                Use a System User token with <code className="bg-white/80 px-1 rounded">whatsapp_business_management</code> and <code className="bg-white/80 px-1 rounded">whatsapp_business_messaging</code>.
              </p>
              <p className="text-sm text-blue-800">
                <a href="https://developers.facebook.com/docs/whatsapp/access-tokens/" target="_blank" rel="noopener noreferrer" className="underline">Meta: Access tokens</a>
              </p>
            </div>
          )}

          {showForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
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
                        onChange={(e) => {
                          const v = e.target.value as typeof formCategory
                          setFormCategory(v)
                          if (v !== 'UTILITY') setFormSubCategory(null)
                          if (v === 'AUTHENTICATION' && formHeaderFormat !== 'TEXT') setFormHeaderFormat('TEXT')
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="MARKETING">MARKETING — Promotional, offers, re-engagement</option>
                        <option value="UTILITY">UTILITY — Order updates, account alerts, transactional</option>
                        <option value="AUTHENTICATION">AUTHENTICATION — OTP, verification only</option>
                      </select>
                      {formCategory === 'MARKETING' && (
                        <p className="mt-1 text-xs text-amber-700">Requires user opt-in. Use for promotions, discounts, cart nudges.</p>
                      )}
                      {formCategory === 'UTILITY' && (
                        <p className="mt-1 text-xs text-blue-700">Delivers without opt-in. Non-promotional, transactional only.</p>
                      )}
                      {formCategory === 'AUTHENTICATION' && (
                        <p className="mt-1 text-xs text-purple-700">OTP only. No emojis, URLs, or media. Include COPY_CODE button.</p>
                      )}
                    </div>
                    {formCategory === 'UTILITY' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sub-category (optional)</label>
                        <select
                          value={formSubCategory ?? ''}
                          onChange={(e) => setFormSubCategory(e.target.value || null)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="">Standard — General transactional</option>
                          <option value="ORDER_DETAILS">ORDER_DETAILS — Invoice/order details with product list</option>
                          <option value="ORDER_STATUS">ORDER_STATUS — Order status updates (pending, shipped, etc.)</option>
                          <option value="RICH_ORDER_STATUS">RICH_ORDER_STATUS — Rich order status with formatting</option>
                        </select>
                        <p className="mt-1 text-xs text-gray-500">Predefined Meta formats for order-related messages.</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                      <select value={formLanguage} onChange={(e) => setFormLanguage(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
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
                      {formCategory !== 'AUTHENTICATION' && (
                        <>
                          <option value="IMAGE">Image</option>
                          <option value="VIDEO">Video</option>
                          <option value="DOCUMENT">Document</option>
                        </>
                      )}
                    </select>
                    {formCategory === 'AUTHENTICATION' && formHeaderFormat !== 'TEXT' && (
                      <p className="mt-1 text-xs text-amber-600">Authentication templates: no media. Use Text header only.</p>
                    )}
                  </div>
                  {formHeaderFormat === 'TEXT' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Header text (optional, max 60 chars; use {"{{1}}"} etc.)</label>
                      <input type="text" value={formHeader} onChange={(e) => setFormHeader(e.target.value)} maxLength={60} placeholder="e.g. Hello {{1}}" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
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
                              const data = await parseJsonResponse(res) as { handle?: string; id?: string; url?: string; error?: string }
                              if (data.handle || data.id) {
                                const mediaId = data.id ?? data.handle ?? ''
                                setFormHeaderMediaId(mediaId)
                                if (data.url) setFormHeaderMediaUrl(data.url)
                                else setFormHeaderMediaUrl(mediaId)
                              } else setFormError(data.error ?? 'Upload failed')
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
                    <p className="text-xs text-gray-500 mb-1.5">Variables: type {"{{1}}"}, {"{{2}}"} etc. Example: &quot;Hi {"{{1}}"}, your order {"{{2}}"} is ready.&quot;</p>
                    <textarea value={formBody} onChange={(e) => setFormBody(e.target.value)} placeholder="Hello {{1}}, your exclusive offer is ready!" rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Footer (optional, max 60 chars)</label>
                    <input type="text" value={formFooter} onChange={(e) => setFormFooter(e.target.value)} maxLength={60} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">Buttons (CTA) – max 10</label>
                      <button type="button" onClick={() => setFormButtons((b) => [...b, { type: 'QUICK_REPLY', text: '', example: '' }])} className="text-xs text-[#ed1b24] hover:underline">+ Add button</button>
                    </div>
                    {formButtons.map((b, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded bg-gray-50">
                        <select value={b.type} onChange={(e) => setFormButtons((prev) => prev.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} className="rounded border border-gray-300 px-2 py-1 text-sm">
                          <option value="QUICK_REPLY">Quick reply</option>
                          <option value="URL">URL</option>
                          <option value="PHONE_NUMBER">Call</option>
                          <option value="COPY_CODE">Copy code</option>
                        </select>
                        <input type="text" value={b.text} onChange={(e) => setFormButtons((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="Button text" maxLength={25} className="flex-1 min-w-[80px] rounded border border-gray-300 px-2 py-1 text-sm" />
                        {(b.type === 'URL' || b.type === 'PHONE_NUMBER' || b.type === 'COPY_CODE') && (
                          <input type="text" value={b.example ?? ''} onChange={(e) => setFormButtons((prev) => prev.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))} placeholder={b.type === 'URL' ? 'https://...' : b.type === 'PHONE_NUMBER' ? '+91...' : 'CODE'} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm" />
                        )}
                        <button type="button" onClick={() => setFormButtons((prev) => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-600 text-sm">Remove</button>
                      </div>
                    ))}
                  </div>
                  <button type="submit" disabled={!formBody.trim() || formSaving} className="rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e] disabled:opacity-50">
                    {formSaving ? 'Saving…' : editingTemplateId ? 'Save changes' : 'Save draft'}
                  </button>
                </form>
                <div className="lg:sticky lg:top-4 h-fit">
                  <p className="text-sm font-medium text-gray-700 mb-2">Live preview</p>
                  <TemplatePreview headerFormat={formHeaderFormat} headerText={formHeader} headerMediaUrl={formHeaderMediaUrl} headerPreviewUrl={formHeaderPreviewUrl} body={formBody} footer={formFooter} buttons={formButtons.filter((b) => b.text.trim())} />
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
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {templates.map((t) => (
                    <div key={t.id} className="rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col overflow-hidden">
                      <div className="p-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-white">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{t.name}</p>
                          <p className="text-xs text-gray-500">{getLanguageName(t.language)} · {t.category}</p>
                        </div>
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${
                          t.status === 'approved' ? 'bg-green-100 text-green-800' :
                          t.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                          t.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                        }`}>{t.status}</span>
                      </div>
                      <div className="p-3 flex-1 min-h-0">
                        <TemplatePreview
                          headerFormat={(t.header_format as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT') ?? 'TEXT'}
                          headerText={t.header_text ?? ''}
                          headerMediaUrl={t.header_media_url ?? ''}
                          headerPreviewUrl={previewTemplate?.id === t.id ? (previewMediaUrl ?? undefined) : (cardMediaUrls[t.id] ?? undefined)}
                          body={t.body_text}
                          footer={t.footer_text ?? ''}
                          buttons={t.buttons?.filter((b) => b?.text) ?? []}
                        />
                      </div>
                      <div className="p-3 border-t border-gray-100 bg-white flex flex-wrap items-center gap-2">
                        <Link href={`/marketing/templates/${t.id}`} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1" title="View details">
                          View
                        </Link>
                        <button type="button" onClick={() => setPreviewTemplate(t)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1" title="Preview">
                          <Eye className="h-3.5 w-3.5" /> Preview
                        </button>
                        {t.status === 'draft' && (
                          <button type="button" onClick={() => openFormForEdit(t)} className="rounded-lg border border-[#ed1b24] px-2.5 py-1.5 text-xs font-medium text-[#ed1b24] hover:bg-red-50 inline-flex items-center gap-1" title="Edit">
                            <FileEdit className="h-3.5 w-3.5" /> Edit
                          </button>
                        )}
                        {deleteConfirmId === t.id ? (
                          <span className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-600">Delete?</span>
                            <button type="button" onClick={() => handleDeleteTemplate(t.id)} disabled={!!deletingId} className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">{deletingId === t.id ? '…' : 'Yes'}</button>
                            <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">No</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setDeleteConfirmId(t.id)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 inline-flex items-center gap-1" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        )}
                        {t.status === 'draft' && (
                          <button type="button" onClick={() => handleSubmitToMeta(t.id)} disabled={!!submittingId} className="rounded-lg border border-[#ed1b24] px-2.5 py-1.5 text-xs font-medium text-[#ed1b24] hover:bg-red-50 disabled:opacity-50">
                            {submittingId === t.id ? '…' : 'Submit'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {metaOnlyTemplates.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">From Meta (created in WhatsApp dashboard)</div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {metaOnlyTemplates.map((m) => (
                        <div key={`${m.name}:${m.language}`} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 flex flex-col justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{m.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{getLanguageName(m.language)}{m.category ? ` · ${m.category}` : ''}</p>
                            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">approved</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-3">Use in Bulk WhatsApp</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {previewTemplate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setPreviewTemplate(null); setPreviewMediaUrl(null) }}>
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Template preview</h3>
                  <button type="button" onClick={() => { setPreviewTemplate(null); setPreviewMediaUrl(null) }} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
                </div>
                <p className="text-sm text-gray-500 mb-2">{previewTemplate.name} · {getLanguageName(previewTemplate.language)}</p>
                <TemplatePreview
                  headerFormat={(previewTemplate.header_format as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT') ?? 'TEXT'}
                  headerText={previewTemplate.header_text ?? ''}
                  headerMediaUrl={previewTemplate.header_media_url ?? ''}
                  headerPreviewUrl={previewMediaUrl ?? undefined}
                  body={previewTemplate.body_text}
                  footer={previewTemplate.footer_text ?? ''}
                  buttons={previewTemplate.buttons?.filter((b) => b?.text) ?? []}
                />
              </div>
            </div>
          )}
        </>
    </div>
  )
}
