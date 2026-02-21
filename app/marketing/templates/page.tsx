'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileText, RefreshCw, Loader2, BookOpen, Eye, Trash2, FileEdit, Upload } from 'lucide-react'
import { TemplatePreview } from '../_components/TemplatePreview'
import type { WhatsAppTemplate, LibraryTemplate } from '../_lib/types'
import { getLanguageName, META_LANGUAGES } from '../_lib/utils'

export default function TemplatesPage() {
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

  const fetchTemplates = useCallback(() => {
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
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

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

          {(showWabaHelp || permissionError || libraryError?.includes('100') || libraryError?.toLowerCase().includes('permission')) && (
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
                      <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as typeof formCategory)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                        <option value="MARKETING">MARKETING</option>
                        <option value="UTILITY">UTILITY</option>
                        <option value="AUTHENTICATION">AUTHENTICATION</option>
                      </select>
                    </div>
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
                    <select value={formHeaderFormat} onChange={(e) => setFormHeaderFormat(e.target.value as typeof formHeaderFormat)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="TEXT">Text</option>
                      <option value="IMAGE">Image</option>
                      <option value="VIDEO">Video</option>
                      <option value="DOCUMENT">Document</option>
                    </select>
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
                        }`}>{t.status}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => setPreviewTemplate(t)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5" title="Preview">
                          <Eye className="h-4 w-4" /> Preview
                        </button>
                        {t.status === 'draft' && (
                          <button type="button" onClick={() => openFormForEdit(t)} className="rounded-lg border border-[#ed1b24] px-3 py-1.5 text-sm font-medium text-[#ed1b24] hover:bg-red-50 inline-flex items-center gap-1.5" title="Edit">
                            <FileEdit className="h-4 w-4" /> Edit
                          </button>
                        )}
                        {deleteConfirmId === t.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Delete?</span>
                            <button type="button" onClick={() => handleDeleteTemplate(t.id)} disabled={!!deletingId} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">{deletingId === t.id ? 'Deleting…' : 'Yes'}</button>
                            <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">No</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setDeleteConfirmId(t.id)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 inline-flex items-center gap-1.5" title="Delete">
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        )}
                        {t.status === 'draft' && (
                          <button type="button" onClick={() => handleSubmitToMeta(t.id)} disabled={!!submittingId} className="rounded-lg border border-[#ed1b24] px-3 py-1.5 text-sm font-medium text-[#ed1b24] hover:bg-red-50 disabled:opacity-50">
                            {submittingId === t.id ? 'Submitting…' : 'Submit for review'}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {metaOnlyTemplates.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">From Meta (created in WhatsApp dashboard)</div>
                    <ul className="divide-y divide-gray-100">
                      {metaOnlyTemplates.map((m) => (
                        <li key={`${m.name}:${m.language}`} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-medium text-gray-900">{m.name}</span>
                            <span className="text-gray-500 text-sm ml-2">({getLanguageName(m.language)})</span>
                            {m.category && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100">{m.category}</span>}
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
                  <button type="button" onClick={() => setPreviewTemplate(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
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
