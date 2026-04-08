'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Database } from '@/shared/types/database'
import {
  DEFAULT_LANDING_FORM_FIELDS,
  type LandingFormField,
  parseLandingFormFields,
} from '@/shared/types/landing-form'

type LandingPageSettings = Database['public']['Tables']['landing_page_settings']['Row']

const MAP_TO_OPTIONS: { value: string; label: string }[] = [
  { value: 'name', label: 'Name (required on form)' },
  { value: 'phone', label: 'Phone (required on form)' },
  { value: 'email', label: 'Email' },
  { value: 'requirement', label: 'Requirement / notes' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'budget_range', label: 'Budget range' },
  { value: 'interest_level', label: 'Interest level (hot / warm / cold)' },
  { value: 'meta:car_model', label: 'Car model (saved in lead meta)' },
  { value: 'meta:interested_product', label: 'Interested product (meta)' },
  { value: '__custom_meta__', label: 'Custom meta key…' },
]

function normalizeLoaded(s: LandingPageSettings | null): LandingPageSettings | null {
  if (!s) return null
  const fields = parseLandingFormFields(s.form_fields)
  return {
    ...s,
    hero_video_url: s.hero_video_url ?? null,
    hero_background: (s.hero_background as LandingPageSettings['hero_background']) ?? 'image',
    hero_background_opacity:
      typeof s.hero_background_opacity === 'number' ? s.hero_background_opacity : 40,
    form_fields: fields as unknown as LandingPageSettings['form_fields'],
  }
}

export default function MarketingLandingEditorPage() {
  const [settings, setSettings] = useState<LandingPageSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const formFields = useMemo(
    () => parseLandingFormFields(settings?.form_fields) as unknown as LandingFormField[],
    [settings?.form_fields]
  )

  const setFormFields = useCallback((next: LandingFormField[]) => {
    setSettings((prev) => (prev ? { ...prev, form_fields: next as unknown as LandingPageSettings['form_fields'] } : null))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/landing-page/settings')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        if (!cancelled) setSettings(normalizeLoaded(data.settings))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function uploadAsset(file: File, kind: 'hero-image' | 'hero-video' | 'section-video') {
    setUploading(kind)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('kind', kind)
      const res = await fetch('/api/landing-page/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      const url = data.url as string
      setSettings((prev) => {
        if (!prev) return prev
        if (kind === 'hero-image') return { ...prev, hero_image_url: url }
        if (kind === 'hero-video') return { ...prev, hero_video_url: url }
        return { ...prev, video_url: url }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    setError(null)
    setSavedOk(false)
    try {
      const fields = parseLandingFormFields(settings.form_fields)
      const res = await fetch('/api/landing-page/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hero_title: settings.hero_title,
          hero_subtitle: settings.hero_subtitle,
          hero_image_url: settings.hero_image_url,
          hero_video_url: settings.hero_video_url,
          hero_background: settings.hero_background,
          hero_background_opacity: settings.hero_background_opacity,
          form_section_title: settings.form_section_title,
          form_button_label: settings.form_button_label,
          form_success_message: settings.form_success_message,
          form_fields: fields,
          video_section_title: settings.video_section_title,
          video_url: settings.video_url,
          video_description: settings.video_description,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSettings(normalizeLoaded(data.settings))
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function addPreset(preset: Partial<LandingFormField> & Pick<LandingFormField, 'label' | 'mapsTo' | 'type'>) {
    const order = Math.max(0, ...formFields.map((f) => f.order)) + 1
    const id = `f_${Date.now()}`
    const mapsTo = preset.mapsTo
    const next: LandingFormField = {
      id,
      type: preset.type,
      label: preset.label,
      placeholder: preset.placeholder,
      required: preset.required ?? false,
      mapsTo,
      order,
      options: preset.options,
    }
    setFormFields([...formFields, next])
  }

  function removeField(id: string) {
    setFormFields(formFields.filter((f) => f.id !== id))
  }

  function updateField(id: string, patch: Partial<LandingFormField>) {
    setFormFields(formFields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function moveField(id: string, dir: -1 | 1) {
    const sorted = [...formFields].sort((a, b) => a.order - b.order)
    const i = sorted.findIndex((f) => f.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= sorted.length) return
    const a = sorted[i]
    const b = sorted[j]
    const next = formFields.map((f) => {
      if (f.id === a.id) return { ...f, order: b.order }
      if (f.id === b.id) return { ...f, order: a.order }
      return f
    })
    setFormFields(next)
  }

  if (loading) {
    return <p className="text-gray-500">Loading…</p>
  }

  if (error && !settings) {
    return <p className="text-red-600">{error}</p>
  }

  if (!settings) return null

  const field =
    'mb-4 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'

  const sortedFields = [...formFields].sort((a, b) => a.order - b.order)

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Public landing page</h2>
          <p className="text-sm text-gray-600 mt-1">
            Hero, configurable form, and video —{' '}
            <Link href="/landing" className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noreferrer">
              /landing
            </Link>
            . Leads use source &quot;Landing page&quot;.{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">utm_medium</code> → ad name;{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">utm_campaign</code> → campaign.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {savedOk ? (
        <p className="text-sm font-medium text-green-800 bg-green-50 border border-green-200 rounded-md px-3 py-2 inline-block">
          Saved.
        </p>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Hero</h3>
        <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
        <input
          className={field}
          value={settings.hero_title}
          onChange={(e) => setSettings({ ...settings, hero_title: e.target.value })}
        />
        <label className="mb-1 block text-sm font-medium text-gray-700">Subtitle</label>
        <textarea
          className={field}
          rows={3}
          value={settings.hero_subtitle}
          onChange={(e) => setSettings({ ...settings, hero_subtitle: e.target.value })}
        />

        <p className="mb-2 text-sm font-medium text-gray-700">Background</p>
        <div className="mb-4 flex flex-wrap gap-4">
          {(['image', 'video', 'none'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="hero_bg"
                checked={settings.hero_background === v}
                onChange={() => setSettings({ ...settings, hero_background: v })}
              />
              {v === 'image' ? 'Image' : v === 'video' ? 'Video' : 'None (gradient only)'}
            </label>
          ))}
        </div>

        {settings.hero_background === 'image' ? (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">Hero image URL</label>
            <input
              className={field}
              value={settings.hero_image_url ?? ''}
              onChange={(e) => setSettings({ ...settings, hero_image_url: e.target.value || null })}
              placeholder="https://… or upload"
            />
            <label className="mt-2 block">
              <span className="text-sm text-gray-600">Upload image (JPEG/PNG/WebP, max 5MB)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block text-sm"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadAsset(f, 'hero-image')
                  e.target.value = ''
                }}
              />
            </label>
          </>
        ) : null}

        {settings.hero_background === 'video' ? (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">Hero video URL (.mp4 / .webm)</label>
            <input
              className={field}
              value={settings.hero_video_url ?? ''}
              onChange={(e) => setSettings({ ...settings, hero_video_url: e.target.value || null })}
              placeholder="https://… or upload"
            />
            <label className="mt-2 block">
              <span className="text-sm text-gray-600">Upload video (MP4/WebM, max 50MB)</span>
              <input
                type="file"
                accept="video/mp4,video/webm"
                className="mt-1 block text-sm"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadAsset(f, 'hero-video')
                  e.target.value = ''
                }}
              />
            </label>
          </>
        ) : null}
        {uploading ? <p className="text-sm text-gray-500 mt-2">Uploading {uploading}…</p> : null}

        {(settings.hero_background === 'image' || settings.hero_background === 'video') && (
          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Background image / video opacity: {settings.hero_background_opacity}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              className="w-full max-w-md accent-blue-600"
              value={settings.hero_background_opacity}
              onChange={(e) =>
                setSettings({ ...settings, hero_background_opacity: Number(e.target.value) })
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              Lower = more subtle background; higher = stronger photo or video.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Form fields</h3>
        <p className="text-sm text-gray-600 mb-4">
          Include fields mapped to <strong>Name</strong> and <strong>Phone</strong> (required for every lead). Custom fields use{' '}
          <code className="text-xs bg-gray-100 px-1">meta:…</code> and appear on the lead record.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            onClick={() => addPreset({ type: 'text', label: 'Car model', mapsTo: 'meta:car_model', placeholder: 'e.g. BMW X5' })}
          >
            + Car model
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            onClick={() =>
              addPreset({
                type: 'text',
                label: 'Interested product',
                mapsTo: 'meta:interested_product',
                placeholder: 'Product or service',
              })
            }
          >
            + Interested product
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            onClick={() => addPreset({ type: 'text', label: 'New field', mapsTo: 'requirement', required: false })}
          >
            + Text → requirement
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            onClick={() => {
              const id = `f_${Date.now()}`
              const order = Math.max(0, ...formFields.map((f) => f.order)) + 1
              setFormFields([
                ...formFields,
                {
                  id,
                  type: 'text',
                  label: 'Custom',
                  mapsTo: 'meta:custom_field',
                  required: false,
                  order,
                },
              ])
            }}
          >
            + Custom meta field
          </button>
        </div>

        <div className="space-y-4">
          {sortedFields.map((f) => (
            <div key={f.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-xs font-mono text-gray-500">{f.id}</span>
                <div className="flex gap-1">
                  <button type="button" className="text-sm text-gray-600 hover:text-gray-900" onClick={() => moveField(f.id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="text-sm text-gray-600 hover:text-gray-900" onClick={() => moveField(f.id, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:text-red-800"
                    onClick={() => removeField(f.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-600">Label</label>
                  <input
                    className={field + ' mb-0'}
                    value={f.label}
                    onChange={(e) => updateField(f.id, { label: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Field type</label>
                  <select
                    className={field + ' mb-0'}
                    value={f.type}
                    onChange={(e) => updateField(f.id, { type: e.target.value as LandingFormField['type'] })}
                  >
                    <option value="text">Text</option>
                    <option value="textarea">Textarea</option>
                    <option value="tel">Phone</option>
                    <option value="email">Email</option>
                    <option value="select">Select</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Maps to (lead data)</label>
                  <select
                    className={field + ' mb-0'}
                    value={
                      MAP_TO_OPTIONS.some((o) => o.value === f.mapsTo)
                        ? f.mapsTo
                        : f.mapsTo.startsWith('meta:')
                          ? '__custom_meta__'
                          : f.mapsTo
                    }
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '__custom_meta__') {
                        updateField(f.id, { mapsTo: 'meta:custom_field' })
                      } else {
                        updateField(f.id, { mapsTo: v })
                      }
                    }}
                  >
                    {MAP_TO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {f.mapsTo.startsWith('meta:') &&
                  f.mapsTo !== 'meta:car_model' &&
                  f.mapsTo !== 'meta:interested_product' ? (
                    <input
                      className={field + ' mt-2 mb-0'}
                      placeholder="Meta key (e.g. notes)"
                      value={f.mapsTo.replace(/^meta:/, '')}
                      onChange={(e) => {
                        const key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') || 'field'
                        updateField(f.id, { mapsTo: `meta:${key}` })
                      }}
                    />
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Placeholder</label>
                  <input
                    className={field + ' mb-0'}
                    value={f.placeholder ?? ''}
                    onChange={(e) => updateField(f.id, { placeholder: e.target.value || undefined })}
                  />
                </div>
                {f.type === 'select' ? (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-600">Options (one per line)</label>
                    <textarea
                      className={field}
                      rows={3}
                      value={(f.options ?? []).join('\n')}
                      onChange={(e) =>
                        updateField(f.id, {
                          options: e.target.value
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => updateField(f.id, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 text-sm text-blue-600 hover:underline"
          onClick={() => setFormFields([...DEFAULT_LANDING_FORM_FIELDS])}
        >
          Reset to default fields (name, phone, email, message)
        </button>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Form copy</h3>
        <label className="mb-1 block text-sm font-medium text-gray-700">Section title</label>
        <input
          className={field}
          value={settings.form_section_title}
          onChange={(e) => setSettings({ ...settings, form_section_title: e.target.value })}
        />
        <label className="mb-1 block text-sm font-medium text-gray-700">Submit button label</label>
        <input
          className={field}
          value={settings.form_button_label}
          onChange={(e) => setSettings({ ...settings, form_button_label: e.target.value })}
        />
        <label className="mb-1 block text-sm font-medium text-gray-700">Success message</label>
        <textarea
          className={field}
          rows={2}
          value={settings.form_success_message}
          onChange={(e) => setSettings({ ...settings, form_success_message: e.target.value })}
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Video section</h3>
        <label className="mb-1 block text-sm font-medium text-gray-700">Section title</label>
        <input
          className={field}
          value={settings.video_section_title}
          onChange={(e) => setSettings({ ...settings, video_section_title: e.target.value })}
        />
        <label className="mb-1 block text-sm font-medium text-gray-700">Video URL (YouTube or direct .mp4)</label>
        <input
          className={field}
          value={settings.video_url}
          onChange={(e) => setSettings({ ...settings, video_url: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=…"
        />
        <label className="mt-2 block">
          <span className="text-sm text-gray-600">Upload section video (MP4/WebM)</span>
          <input
            type="file"
            accept="video/mp4,video/webm"
            className="mt-1 block text-sm"
            disabled={!!uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadAsset(f, 'section-video')
              e.target.value = ''
            }}
          />
        </label>
        <label className="mb-1 mt-4 block text-sm font-medium text-gray-700">Description (optional)</label>
        <textarea
          className={field}
          rows={2}
          value={settings.video_description ?? ''}
          onChange={(e) => setSettings({ ...settings, video_description: e.target.value || null })}
        />
      </section>
    </div>
  )
}
