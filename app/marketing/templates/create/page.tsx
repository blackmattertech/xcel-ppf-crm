'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle } from 'lucide-react'
import { TemplatePreview } from '../../_components/TemplatePreview'
import { META_LANGUAGES } from '../../_lib/utils'

const CATEGORIES = [
  { value: 'UTILITY' as const, label: 'Utility', help: 'User-triggered updates, order confirmations, account alerts' },
  { value: 'MARKETING' as const, label: 'Marketing', help: 'Promotional or engagement messages' },
  { value: 'AUTHENTICATION' as const, label: 'Authentication', help: 'OTP / verification only' },
]

const SUBTYPES: Record<string, Array<{ value: string; label: string }>> = {
  UTILITY: [
    { value: 'STANDARD', label: 'Standard' },
    { value: 'CALL_PERMISSION_REQUEST', label: 'Call permission request' },
  ],
  MARKETING: [
    { value: 'STANDARD', label: 'Standard' },
    { value: 'CALL_PERMISSION_REQUEST', label: 'Call permission request' },
    { value: 'CATALOG', label: 'Catalog' },
    { value: 'LIMITED_TIME_OFFER', label: 'Limited time offer' },
    { value: 'PRODUCT_CARD_CAROUSEL', label: 'Product card carousel' },
  ],
  AUTHENTICATION: [{ value: 'AUTHENTICATION_OTP', label: 'Authentication OTP' }],
}

export default function CreateTemplatePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [category, setCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY')
  const [subtype, setSubtype] = useState('STANDARD')
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en_US')
  const [body, setBody] = useState('')
  const [footer, setFooter] = useState('')
  const [headerText, setHeaderText] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogConnected, setCatalogConnected] = useState<boolean | null>(null)

  const subtypes = SUBTYPES[category] ?? SUBTYPES.UTILITY
  const needsCatalog = subtype === 'CATALOG' || subtype === 'PRODUCT_CARD_CAROUSEL'

  useEffect(() => {
    if (needsCatalog && catalogConnected === null) {
      fetch('/api/marketing/whatsapp/catalog-status', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => setCatalogConnected(d.connected === true))
        .catch(() => setCatalogConnected(false))
    }
  }, [needsCatalog, catalogConnected])

  const createDraft = async () => {
    setSaving(true)
    setError(null)
    const bodyText = body.trim() || 'Your message here'
    const components: unknown[] = []
    if (headerText) components.push({ type: 'HEADER', format: 'TEXT', text: headerText })
    components.push({ type: 'BODY', text: bodyText, variables: [] })
    if (footer) components.push({ type: 'FOOTER', text: footer })
    const res = await fetch('/api/marketing/whatsapp/template-drafts', {
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
    const components: unknown[] = []
    if (headerText) components.push({ type: 'HEADER', format: 'TEXT', text: headerText })
    components.push({ type: 'BODY', text: body, variables: [] })
    if (footer) components.push({ type: 'FOOTER', text: footer })
    const res = await fetch(`/api/marketing/whatsapp/template-drafts/${draftId}`, {
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
    const res = await fetch(`/api/marketing/whatsapp/template-drafts/${draftId}/submit`, {
      method: 'POST',
      credentials: 'include',
    })
    const data = await res.json()
    setSubmitting(false)
    if (data.error) {
      setError(data.error)
      return
    }
    const templateId = data.template?.id
    if (templateId) router.push(`/marketing/templates/${templateId}`)
    else router.push('/marketing/templates')
  }

  const nameValid = /^[a-z0-9_]+$/.test(name) && name.length <= 512

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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

        {step === 1 && (
          <>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Step 1: Category & subtype</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => { setCategory(c.value); setSubtype(SUBTYPES[c.value]?.[0]?.value ?? 'STANDARD') }}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                        category === c.value ? 'border-[#ed1b24] bg-red-50 text-[#ed1b24]' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">{CATEGORIES.find((c) => c.value === category)?.help}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subtype</label>
                <select
                  value={subtype}
                  onChange={(e) => setSubtype(e.target.value)}
                  className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {subtypes.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <TemplatePreview
                  headerFormat="TEXT"
                  headerText={headerText}
                  headerMediaUrl=""
                  body={body}
                  footer={footer}
                  buttons={[]}
                />
              </div>
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
            </div>
            <div className="mt-6">
              <button type="button" onClick={() => setStep(3)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
