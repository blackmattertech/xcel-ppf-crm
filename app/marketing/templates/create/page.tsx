'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle, Megaphone, Bell, Key, Upload } from 'lucide-react'
import { TemplatePreview } from '../../_components/TemplatePreview'
import { META_LANGUAGES } from '../../_lib/utils'
import { cachedFetch } from '@/lib/api-client'

const CATEGORIES = [
  { value: 'MARKETING' as const, label: 'Marketing', help: 'Engage customers with promotions, offers, and announcements', icon: Megaphone },
  { value: 'UTILITY' as const, label: 'Utility', help: 'User-triggered updates, order confirmations, account alerts', icon: Bell },
  { value: 'AUTHENTICATION' as const, label: 'Authentication', help: 'OTP and verification codes only', icon: Key },
]

type SubtypeOption = { value: string; label: string; description: string; goodFor?: string[]; customize?: string[] }
const SUBTYPES: Record<string, SubtypeOption[]> = {
  MARKETING: [
    { value: 'STANDARD', label: 'Default', description: 'Send messages with media and customized buttons to engage your customers.', goodFor: ['Welcome messages', 'Promotions', 'Offers', 'Coupons', 'Newsletters', 'Announcements'], customize: ['Media', 'Header', 'Body', 'Footer', 'Button'] },
    { value: 'CATALOG', label: 'Catalog', description: 'Send messages that drive sales by connecting your product catalog.', goodFor: ['Product discovery', 'Catalog sharing'], customize: ['Body', 'Footer', 'Catalog button'] },
    { value: 'FLOWS', label: 'Flows', description: 'Send a form to capture customer interests, appointment requests or run surveys.', goodFor: ['Forms', 'Surveys', 'Appointment requests'], customize: ['Body', 'Footer', 'Flow'] },
    { value: 'ORDER_DETAILS', label: 'Order Details', description: 'Send messages through which customers can pay you.', goodFor: ['Payment/invoice reminders', 'Billing information', 'Product availability', 'Cart abandonment'], customize: ['Header', 'Body', 'Footer'] },
    { value: 'CALL_PERMISSION_REQUEST', label: 'Calling permissions request', description: 'Ask customers if you can call them on WhatsApp.', goodFor: ['Requesting call permission'], customize: ['Body'] },
  ],
  UTILITY: [
    { value: 'STANDARD', label: 'Default', description: 'Send messages about an existing order or account.', goodFor: ['Order updates', 'Account alerts', 'Transactional messages'], customize: ['Header', 'Body', 'Footer', 'Buttons'] },
    { value: 'FLOWS', label: 'Flows', description: 'Send a form to collect feedback, send reminders or manage orders.', goodFor: ['Feedback', 'Reminders', 'Order management'], customize: ['Body', 'Footer', 'Flow'] },
    { value: 'ORDER_STATUS', label: 'Order Status', description: 'Send messages to tell customers about the progress of their orders.', goodFor: ['Order status updates', 'Shipping notifications'], customize: ['Header', 'Body', 'Footer'] },
    { value: 'ORDER_DETAILS', label: 'Order Details', description: 'Send messages through which customers can pay you.', goodFor: ['Payment reminders', 'Invoice details'], customize: ['Header', 'Body', 'Footer'] },
    { value: 'CALL_PERMISSION_REQUEST', label: 'Calling permissions request', description: 'Ask customers if you can call them on WhatsApp.', goodFor: ['Requesting call permission'], customize: ['Body'] },
  ],
  AUTHENTICATION: [
    { value: 'AUTHENTICATION_OTP', label: 'One-time Passcode', description: 'Send codes to verify a transaction or login.', goodFor: ['One-time password', 'Account recovery code', 'Account verification', 'Integrity challenges'], customize: ['Code delivery method'] },
  ],
}

const BUTTON_TYPES = [
  { value: 'QUICK_REPLY', label: 'Custom', description: 'Quick reply button', icon: '↩' },
  { value: 'URL', label: 'Visit website', description: 'Link to a URL', icon: '🔗' },
  { value: 'CALL_REQUEST', label: 'Call on WhatsApp', description: 'Initiate a WhatsApp call', icon: '📞' },
  { value: 'PHONE_NUMBER', label: 'Call phone number', description: 'Call a phone number', icon: '📱' },
  { value: 'FLOW', label: 'Complete Flow', description: 'Open a flow (form/survey)', icon: '📄' },
  { value: 'COPY_CODE', label: 'Copy offer code', description: 'Copy a code to clipboard', icon: '📋' },
] as const

type ButtonEntry = { type: string; text: string; example?: string; url?: string; phoneNumber?: string }
const MAX_BUTTONS = 10

function buildBodyVariables(text: string): Array<{ kind: 'positional'; index: number; example: string }> {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)]
  const indices = Array.from(new Set(matches.map((m) => Number(m[1]))))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  return indices.map((index) => ({ kind: 'positional', index, example: `Sample ${index}` }))
}

export default function CreateTemplatePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [category, setCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('MARKETING')
  const [subtype, setSubtype] = useState('STANDARD')
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en_US')
  const [body, setBody] = useState('')
  const [footer, setFooter] = useState('')
  const [headerText, setHeaderText] = useState('')
  const [headerFormat, setHeaderFormat] = useState<'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('TEXT')
  const [headerMediaUrl, setHeaderMediaUrl] = useState('')
  const [headerMediaId, setHeaderMediaId] = useState('')
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState('')
  const [headerUploading, setHeaderUploading] = useState(false)
  const headerPreviewUrlRef = useRef<string | null>(null)
  const [buttons, setButtons] = useState<ButtonEntry[]>([])
  const resetHeaderMedia = () => {
    setHeaderMediaUrl('')
    setHeaderMediaId('')
    if (headerPreviewUrlRef.current) {
      URL.revokeObjectURL(headerPreviewUrlRef.current)
      headerPreviewUrlRef.current = null
    }
    setHeaderPreviewUrl('')
  }

  useEffect(() => {
    if (headerFormat === 'TEXT') {
      resetHeaderMedia()
      return
    }
    setHeaderText('')
  }, [headerFormat])

  useEffect(() => {
    if (subtype !== 'STANDARD' && headerFormat !== 'TEXT') {
      setHeaderFormat('TEXT')
    }
  }, [subtype, headerFormat])

  useEffect(() => {
    return () => {
      if (headerPreviewUrlRef.current) URL.revokeObjectURL(headerPreviewUrlRef.current)
    }
  }, [])

  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogConnected, setCatalogConnected] = useState<boolean | null>(null)

  const subtypes = SUBTYPES[category] ?? SUBTYPES.MARKETING
  const selectedSubtypeInfo = subtypes.find((s) => s.value === subtype)
  const needsCatalog = subtype === 'CATALOG' || subtype === 'PRODUCT_CARD_CAROUSEL'

  useEffect(() => {
    if (needsCatalog && catalogConnected === null) {
      cachedFetch('/api/marketing/whatsapp/catalog-status', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => setCatalogConnected(d.connected === true))
        .catch(() => setCatalogConnected(false))
    }
  }, [needsCatalog, catalogConnected])

  const buildButtonsComponent = () => {
    const list = buttons.filter((b) => b.text.trim()).slice(0, MAX_BUTTONS)
    if (list.length === 0) return []
    return [{
      type: 'BUTTONS',
      buttons: list.map((b) => {
        const base = { type: b.type, text: b.text.trim() }
        if (b.type === 'URL' && (b.example?.trim() || b.url?.trim())) return { ...base, example: b.example ?? b.url }
        if (b.type === 'PHONE_NUMBER' && (b.example?.trim() || b.phoneNumber?.trim())) return { ...base, example: b.example ?? b.phoneNumber }
        if (b.type === 'COPY_CODE' && b.example?.trim()) return { ...base, example: b.example }
        return base
      }),
    }]
  }

  const createDraft = async () => {
    setSaving(true)
    setError(null)
    const bodyText = body.trim() || 'Your message here'
    const bodyVariables = buildBodyVariables(bodyText)
    const components: unknown[] = []
    if (headerFormat === 'TEXT' && headerText.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() })
    if (headerFormat !== 'TEXT' && headerMediaId.trim()) {
      components.push({
        type: 'HEADER',
        format: headerFormat,
        headerHandle: headerMediaId.trim(),
        headerMediaUrl: headerMediaUrl.trim() || undefined,
      })
    }
    components.push({ type: 'BODY', text: bodyText, variables: bodyVariables })
    if (footer) components.push({ type: 'FOOTER', text: footer })
    components.push(...buildButtonsComponent())
    const res = await cachedFetch('/api/marketing/whatsapp/template-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        category,
        templateSubtype: subtype,
        name: name || 'new_template',
        language: language || 'en_US',
        parameterFormat: 'positional',
        normalizedTemplate: {
          wabaId: '',
          name: name || 'new_template',
          category,
          subtype,
          language: language || 'en_US',
          parameterFormat: 'positional',
          components,
        },
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) {
      setError(data.error)
      return null
    }
    setDraftId(data.draft?.id ?? null)
    return data.draft?.id
  }

  const updateDraft = async () => {
    if (!draftId) return
    setSaving(true)
    setError(null)
    const bodyVariables = buildBodyVariables(body)
    const components: unknown[] = []
    if (headerFormat === 'TEXT' && headerText.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() })
    if (headerFormat !== 'TEXT' && headerMediaId.trim()) {
      components.push({
        type: 'HEADER',
        format: headerFormat,
        headerHandle: headerMediaId.trim(),
        headerMediaUrl: headerMediaUrl.trim() || undefined,
      })
    }
    components.push({ type: 'BODY', text: body, variables: bodyVariables })
    if (footer) components.push({ type: 'FOOTER', text: footer })
    components.push(...buildButtonsComponent())
    const res = await cachedFetch(`/api/marketing/whatsapp/template-drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: name || 'new_template',
        language,
        components,
        normalizedTemplate: {
          wabaId: '',
          name: name || 'new_template',
          category,
          subtype,
          language,
          parameterFormat: 'positional',
          components,
        },
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) setError(data.error)
  }

  const handleStep1Next = () => {
    if (category === 'AUTHENTICATION') setHeaderFormat('TEXT')
    setStep(2)
  }

  const handleStep2Next = async () => {
    if (!draftId) {
      const id = await createDraft()
      if (id) setStep(3)
    } else {
      await updateDraft()
      setStep(3)
    }
  }

  const handleStep3Next = async () => {
    if (headerFormat !== 'TEXT' && !headerMediaId.trim()) {
      setError(`Upload a ${headerFormat.toLowerCase()} header file before continuing.`)
      return
    }
    await updateDraft()
    if (!error) setStep(4)
  }

  const handleSubmit = async () => {
    if (!draftId) return
    if (needsCatalog && !catalogConnected) {
      setError('Connect ecommerce catalog in Meta Business Manager first.')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await cachedFetch(`/api/marketing/whatsapp/template-drafts/${draftId}/submit`, {
      method: 'POST',
      credentials: 'include',
    })
    const data = await res.json()
    setSubmitting(false)
    if (data.error) {
      const details = Array.isArray(data.errors) && data.errors.length > 0
        ? `\n${data.errors.map((e: string) => `- ${e}`).join('\n')}`
        : ''
      const metaDetails = data.metaResponse?.error?.message
        ? `\nMeta: ${data.metaResponse.error.message}${data.metaResponse.error.code ? ` (code ${data.metaResponse.error.code})` : ''}`
        : ''
      setError(`${data.error}${details}${metaDetails}`)
      return
    }
    const templateId = data.template?.id
    if (templateId) router.push(`/marketing/templates/${templateId}`)
    else router.push('/marketing/templates')
  }

  const nameValid = /^[a-z0-9_]+$/.test(name) && name.length <= 512

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/marketing/templates" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back to templates
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Create template</h1>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
          <div>
        {step === 1 && (
          <>
            <p className="text-sm text-gray-600 mb-4">Choose the category that best describes your message template. Then select the type of message you want to send.</p>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => {
                    const Icon = c.icon
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => { setCategory(c.value); setSubtype(SUBTYPES[c.value]?.[0]?.value ?? 'STANDARD') }}
                        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                          category === c.value ? 'border-[#ed1b24] bg-red-50 text-[#ed1b24]' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {Icon && <Icon className="h-4 w-4" />}
                        {c.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">{CATEGORIES.find((c) => c.value === category)?.help}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message template type</label>
                <div className="space-y-3">
                  {subtypes.map((s) => (
                    <label
                      key={s.value}
                      className={`flex gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                        subtype === s.value ? 'border-[#ed1b24] bg-red-50/50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="subtype"
                        value={s.value}
                        checked={subtype === s.value}
                        onChange={() => setSubtype(s.value)}
                        className="mt-1 h-4 w-4 border-gray-300 text-[#ed1b24] focus:ring-[#ed1b24]"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900">{s.label}</span>
                        <p className="mt-0.5 text-sm text-gray-600">{s.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedSubtypeInfo && (selectedSubtypeInfo.goodFor?.length || selectedSubtypeInfo.customize?.length) && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
                    {selectedSubtypeInfo.goodFor && selectedSubtypeInfo.goodFor.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">This template is good for</p>
                        <p className="text-sm text-gray-700">{selectedSubtypeInfo.goodFor.join(', ')}</p>
                      </div>
                    )}
                    {selectedSubtypeInfo.customize && selectedSubtypeInfo.customize.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Template areas you can customize</p>
                        <p className="text-sm text-gray-700">{selectedSubtypeInfo.customize.join(', ')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleStep1Next}
                disabled={saving}
                className="rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Next'}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Step 2: Name & language</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template name (lowercase, underscores only)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. order_confirmation"
                  className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                {name && !nameValid && <p className="mt-1 text-xs text-amber-600">Only a-z, 0-9, underscore; max 512 chars</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {META_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <button type="button" onClick={() => setStep(1)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Back</button>
              <button
                type="button"
                onClick={handleStep2Next}
                disabled={saving || !name || !nameValid}
                className="rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Next'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Step 3: Content</h2>
            <div className="space-y-4">
              {subtype === 'STANDARD' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header type</label>
                  <select
                    value={headerFormat}
                    onChange={(e) => {
                      const next = e.target.value as typeof headerFormat
                      setHeaderFormat(next)
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="TEXT">Text</option>
                    {category !== 'AUTHENTICATION' && (
                      <>
                        <option value="IMAGE">Image</option>
                        <option value="VIDEO">Video</option>
                        <option value="DOCUMENT">Document</option>
                      </>
                    )}
                  </select>
                </div>
              )}
              {subtype === 'STANDARD' && headerFormat === 'TEXT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header (optional)</label>
                  <input
                    type="text"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value.slice(0, 60))}
                    placeholder="e.g. Hello {{1}}"
                    maxLength={60}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              {subtype === 'STANDARD' && (headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload {headerFormat.toLowerCase()} attachment
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 cursor-pointer">
                    <input
                      type="file"
                      accept={headerFormat === 'IMAGE' ? 'image/jpeg,image/png,image/gif,image/webp' : headerFormat === 'VIDEO' ? 'video/mp4,video/x-m4v' : 'application/pdf'}
                      className="sr-only"
                      disabled={headerUploading}
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (headerPreviewUrlRef.current) {
                          URL.revokeObjectURL(headerPreviewUrlRef.current)
                          headerPreviewUrlRef.current = null
                        }
                        const objectUrl = URL.createObjectURL(f)
                        headerPreviewUrlRef.current = objectUrl
                        setHeaderPreviewUrl(objectUrl)
                        setHeaderUploading(true)
                        setError(null)
                        const fd = new FormData()
                        fd.append('file', f)
                        try {
                          const res = await cachedFetch('/api/marketing/whatsapp/upload-media', { method: 'POST', body: fd, credentials: 'include' })
                          const data = await res.json() as { handle?: string; id?: string; url?: string; error?: string }
                          if (data.handle || data.id) {
                            const mediaId = data.id ?? data.handle ?? ''
                            setHeaderMediaId(mediaId)
                            setHeaderMediaUrl(data.url ?? mediaId)
                          } else {
                            setError(data.error ?? 'Upload failed')
                          }
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Upload failed')
                        } finally {
                          setHeaderUploading(false)
                          e.target.value = ''
                        }
                      }}
                    />
                    {headerUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {headerUploading ? 'Uploading...' : `Choose ${headerFormat.toLowerCase()} file`}
                  </label>
                  {headerMediaId && <p className="mt-1.5 text-xs text-green-600">Uploaded to Meta ✓</p>}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body (use {"{{1}}"}, {"{{2}}"} for variables)</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hello {{1}}, your order {{2}} is confirmed."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              {subtype === 'STANDARD' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Footer (optional, max 60)</label>
                  <input
                    type="text"
                    value={footer}
                    onChange={(e) => setFooter(e.target.value.slice(0, 60))}
                    maxLength={60}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              {(subtype === 'STANDARD' || subtype === 'FLOWS' || subtype === 'ORDER_DETAILS') && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Buttons • Optional</label>
                    {buttons.length < MAX_BUTTONS && (
                      <div className="relative group">
                        <select
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 appearance-none pr-8"
                          value=""
                          onChange={(e) => {
                            const v = e.target.value
                            if (v) {
                              setButtons((prev) => [...prev, { type: v, text: '' }])
                              e.target.value = ''
                            }
                          }}
                        >
                          <option value="">+ Add button</option>
                          {BUTTON_TYPES.map((bt) => (
                            <option key={bt.value} value={bt.value}>{bt.label}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">▼</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Create buttons that let customers respond or take action. You can add up to {MAX_BUTTONS} buttons. If you add more than 3, they will appear in a list.</p>
                  {buttons.map((b, i) => (
                    <div key={i} className="flex flex-wrap items-start gap-2 mb-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-xs text-gray-500 w-24 shrink-0">{BUTTON_TYPES.find((bt) => bt.value === b.type)?.label ?? b.type}</span>
                      <input
                        type="text"
                        value={b.text}
                        onChange={(e) => setButtons((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value.slice(0, 25) } : x)))}
                        placeholder="Button text (max 25)"
                        maxLength={25}
                        className="flex-1 min-w-[120px] rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      {(b.type === 'URL' || b.type === 'PHONE_NUMBER' || b.type === 'COPY_CODE') && (
                        <input
                          type="text"
                          value={b.type === 'URL' ? (b.example ?? b.url ?? '') : b.type === 'PHONE_NUMBER' ? (b.example ?? b.phoneNumber ?? '') : (b.example ?? '')}
                          onChange={(e) => {
                            const val = e.target.value
                            setButtons((prev) => prev.map((x, j) => {
                              if (j !== i) return x
                              if (x.type === 'URL') return { ...x, example: val, url: val }
                              if (x.type === 'PHONE_NUMBER') return { ...x, example: val, phoneNumber: val }
                              return { ...x, example: val }
                            }))
                          }}
                          placeholder={b.type === 'URL' ? 'https://example.com' : b.type === 'PHONE_NUMBER' ? '+1234567890' : 'Offer code'}
                          maxLength={b.type === 'COPY_CODE' ? 15 : 2000}
                          className="w-40 rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setButtons((prev) => prev.filter((_, j) => j !== i))}
                        className="text-gray-500 hover:text-red-600 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-between">
              <button type="button" onClick={() => setStep(2)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Back</button>
              <button
                type="button"
                onClick={handleStep3Next}
                disabled={saving || !body.trim()}
                className="rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Next'}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Step 4: Preview & submit</h2>
            <div>
              {needsCatalog && catalogConnected === false && (
                <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Connect ecommerce catalog in Meta Business Manager before submitting.
                </div>
              )}
              <p className="text-sm text-gray-600 mb-4">
                Submit for Meta review. Only approved templates can be sent.
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || (needsCatalog && !catalogConnected)}
                className="rounded-lg bg-[#ed1b24] px-4 py-2 text-sm font-medium text-white hover:bg-[#c0040e] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Submit for review
              </button>
            </div>
            <div className="mt-6">
              <button type="button" onClick={() => setStep(3)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Back</button>
            </div>
          </>
        )}
          </div>
          <div className="lg:sticky lg:top-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Live preview</p>
            <TemplatePreview
              headerFormat={headerFormat}
              headerText={headerText}
              headerMediaUrl={headerMediaUrl}
              headerPreviewUrl={headerPreviewUrl}
              body={body}
              footer={footer}
              buttons={buttons.filter((b) => b.text.trim()).map((b) => ({ type: b.type, text: b.text.trim(), example: b.example }))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
