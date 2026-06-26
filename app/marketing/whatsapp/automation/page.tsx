'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  AlertTriangle,
  Image as ImageIcon,
  Video,
  MessageSquare,
  LayoutTemplate,
  BarChart3,
} from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'
import type {
  AutomationFlow,
  AutomationFlowWithTriggers,
  AutomationMessageType,
  AutomationTrigger,
  UpsertAutomationTriggerInput,
} from '@/shared/whatsapp-automation-types'
import {
  defaultParameterValues,
  getTemplateParameterSlotCounts,
} from '@/shared/lead-template-tokens'
import { TemplateVariableMapper } from '@/components/whatsapp/TemplateVariableMapper'

interface WhatsAppTemplate {
  id: string
  name: string
  language: string
  status: string
  body_text: string
  header_text?: string | null
  header_format?: string | null
}

type TriggerDraft = UpsertAutomationTriggerInput & { _key: string }

function emptyTrigger(day: number): TriggerDraft {
  return {
    _key: `day-${day}`,
    day_offset: day,
    message_type: 'template',
    template_id: null,
    body_parameters: null,
    header_parameters: null,
    message_body: null,
    media_url: null,
    media_mime_type: null,
    media_file_name: null,
    media_meta_id: null,
  }
}

function triggerFromApi(t: AutomationTrigger): TriggerDraft {
  return {
    _key: t.id,
    day_offset: t.day_offset,
    message_type: t.message_type,
    template_id: t.template_id,
    body_parameters: t.body_parameters,
    header_parameters: t.header_parameters,
    message_body: t.message_body,
    media_url: t.media_url,
    media_mime_type: t.media_mime_type,
    media_file_name: t.media_file_name,
    media_meta_id: t.media_meta_id,
  }
}

export default function WhatsAppAutomationPage() {
  const [flows, setFlows] = useState<AutomationFlow[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<AutomationFlowWithTriggers | null>(null)
  const [triggerDrafts, setTriggerDrafts] = useState<TriggerDraft[]>([])
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formCycleDays, setFormCycleDays] = useState(30)
  const [formRestart, setFormRestart] = useState(false)
  const [formActive, setFormActive] = useState(true)

  const loadFlows = useCallback(async () => {
    setLoading(true)
    try {
      const res = await cachedFetch('/api/automation/whatsapp/flows')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load flows')
      setFlows(data.flows || [])
      setActiveCount(data.activeCount ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await cachedFetch('/api/marketing/whatsapp/templates?status=APPROVED')
      const data = await res.json()
      if (res.ok) setTemplates(data.templates || data.items || [])
    } catch {
      /* optional */
    }
  }, [])

  const loadFlow = useCallback(async (id: string) => {
    setError(null)
    const res = await cachedFetch(`/api/automation/whatsapp/flows/${id}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load flow')
    const flow = data as AutomationFlowWithTriggers
    setEditing(flow)
    setFormName(flow.name)
    setFormCycleDays(flow.cycle_days)
    setFormRestart(flow.restart_on_complete)
    setFormActive(flow.is_active)
    setTriggerDrafts(flow.triggers.map(triggerFromApi))
    setSelectedId(id)
    setSelectedDay(null)
  }, [])

  useEffect(() => {
    void loadFlows()
    void loadTemplates()
  }, [loadFlows, loadTemplates])

  async function createFlow() {
    setSaving(true)
    setError(null)
    try {
      const res = await cachedFetch('/api/automation/whatsapp/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New automation flow',
          cycle_days: 30,
          restart_on_complete: false,
          is_active: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create failed')
      await loadFlows()
      await loadFlow(data.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveFlow() {
    if (!selectedId) return
    setSaving(true)
    setError(null)
    try {
      const triggersPayload = triggerDrafts
        .filter((t) => t.day_offset < formCycleDays)
        .map(({ _key: _k, ...rest }) => rest)

      for (const t of triggersPayload) {
        if (t.message_type === 'template' && t.template_id) {
          const tpl = templates.find((x) => x.id === t.template_id)
          if (tpl) {
            const { bodyCount, headerCount } = getTemplateParameterSlotCounts(tpl)
            if (bodyCount > 0) {
              const params = t.body_parameters || []
              if (params.length < bodyCount || params.some((p) => !String(p).trim())) {
                throw new Error(
                  `Day ${t.day_offset}: fill all ${bodyCount} template body variable(s) (lead name, car, etc.)`
                )
              }
            }
            if (headerCount > 0) {
              const params = t.header_parameters || []
              if (params.length < headerCount || params.some((p) => !String(p).trim())) {
                throw new Error(
                  `Day ${t.day_offset}: fill all ${headerCount} template header variable(s)`
                )
              }
            }
          }
        }
        if (t.message_type === 'image' || t.message_type === 'video') {
          if (!t.media_url?.trim()) {
            throw new Error(
              `Day ${t.day_offset}: choose and upload a ${t.message_type} file before saving`
            )
          }
        }
      }

      const res = await cachedFetch(`/api/automation/whatsapp/flows/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          cycle_days: formCycleDays,
          restart_on_complete: formRestart,
          is_active: formActive,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      const trigRes = await cachedFetch(`/api/automation/whatsapp/flows/${selectedId}/triggers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggers: triggersPayload }),
      })
      const trigData = await trigRes.json()
      if (!trigRes.ok) throw new Error(trigData.error || 'Failed to save triggers')

      await loadFlows()
      await loadFlow(selectedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFlow(id: string) {
    if (!confirm('Delete this flow and all enrollments?')) return
    const res = await cachedFetch(`/api/automation/whatsapp/flows/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Delete failed')
      return
    }
    setSelectedId(null)
    setEditing(null)
    await loadFlows()
  }

  function getTriggerForDay(day: number): TriggerDraft | undefined {
    return triggerDrafts.find((t) => t.day_offset === day)
  }

  function upsertDayTrigger(day: number, patch: Partial<TriggerDraft>) {
    const existing = getTriggerForDay(day)
    if (existing) {
      setTriggerDrafts((prev) =>
        prev.map((t) => (t.day_offset === day ? { ...t, ...patch } : t))
      )
    } else {
      setTriggerDrafts((prev) => [...prev, { ...emptyTrigger(day), ...patch }])
    }
  }

  function removeDayTrigger(day: number) {
    setTriggerDrafts((prev) => prev.filter((t) => t.day_offset !== day))
    if (selectedDay === day) setSelectedDay(null)
  }

  async function uploadMedia(file: File, mediaType: 'image' | 'video') {
    if (selectedDay === null) return
    setUploading(true)
    setError(null)
    try {
      const signRes = await cachedFetch('/api/marketing/whatsapp/upload-media/signed-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
      })
      const signData = (await signRes.json()) as {
        signedUrl?: string
        token?: string
        path?: string
        error?: string
      }
      if (!signRes.ok || !signData.path || !signData.signedUrl) {
        throw new Error(signData.error || 'Failed to create upload URL')
      }

      const storageUpload = await fetch(signData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!storageUpload.ok) throw new Error('Failed to upload file to storage')

      const res = await cachedFetch('/api/marketing/whatsapp/upload-media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: signData.path,
          mimeType: file.type,
          fileName: file.name,
        }),
      })
      const data = (await res.json()) as {
        url?: string
        handle?: string
        id?: string
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      const mediaUrl = data.url?.trim()
      if (!mediaUrl) {
        throw new Error(
          'Upload to Meta succeeded but no public media URL was stored. Ensure the template-media Supabase bucket exists and is public.'
        )
      }

      upsertDayTrigger(selectedDay, {
        message_type: mediaType,
        media_url: mediaUrl,
        media_meta_id: data.handle || data.id || null,
        media_mime_type: file.type || null,
        media_file_name: file.name,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const dayTrigger = selectedDay !== null ? getTriggerForDay(selectedDay) : undefined

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/marketing/whatsapp"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          WhatsApp hub
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WhatsApp automation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Up to 2 active flows · {activeCount}/2 active · 1–30 day cycles with flexible trigger days
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/marketing/whatsapp/automation/analytics"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => void loadFlows()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            disabled={saving || activeCount >= 2}
            onClick={() => void createFlow()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#128C7E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New flow
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Flows</p>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : flows.length === 0 ? (
            <p className="px-2 py-4 text-sm text-slate-500">No flows yet.</p>
          ) : (
            flows.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => void loadFlow(f.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedId === f.id ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">
                  {f.cycle_days} days · {f.is_active ? 'Active' : 'Inactive'}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {!editing ? (
            <p className="text-sm text-slate-500">Select a flow or create a new one.</p>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Flow name</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Cycle length (days)</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={formCycleDays}
                    onChange={(e) => setFormCycleDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formRestart} onChange={(e) => setFormRestart(e.target.checked)} />
                  Restart from day 0 when cycle completes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                  Active
                </label>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Trigger timeline (Day 0 = enroll day)</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: formCycleDays }, (_, i) => {
                    const has = !!getTriggerForDay(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedDay(i)}
                        className={`h-9 min-w-[2.5rem] rounded-lg border px-2 text-xs font-medium ${
                          selectedDay === i
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                            : has
                              ? 'border-[#128C7E] bg-[#128C7E]/10 text-[#128C7E]'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        D{i}
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedDay !== null && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">Day {selectedDay}</h3>
                    {dayTrigger && (
                      <button
                        type="button"
                        onClick={() => removeDayTrigger(selectedDay)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove trigger
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['template', 'text', 'image', 'video'] as AutomationMessageType[]).map((mt) => (
                      <button
                        key={mt}
                        type="button"
                        onClick={() =>
                          upsertDayTrigger(selectedDay, {
                            message_type: mt,
                            template_id: mt === 'template' ? dayTrigger?.template_id ?? null : null,
                            ...(mt !== dayTrigger?.message_type
                              ? {
                                  media_url: null,
                                  media_meta_id: null,
                                  media_mime_type: null,
                                  media_file_name: null,
                                }
                              : {}),
                          })
                        }
                        className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs capitalize ${
                          (dayTrigger?.message_type || 'template') === mt
                            ? 'border-emerald-500 bg-white'
                            : 'border-slate-200'
                        }`}
                      >
                        {mt === 'template' && <LayoutTemplate className="h-3.5 w-3.5" />}
                        {mt === 'text' && <MessageSquare className="h-3.5 w-3.5" />}
                        {mt === 'image' && <ImageIcon className="h-3.5 w-3.5" />}
                        {mt === 'video' && <Video className="h-3.5 w-3.5" />}
                        {mt}
                      </button>
                    ))}
                  </div>

                  {(dayTrigger?.message_type === 'text' ||
                    dayTrigger?.message_type === 'image' ||
                    dayTrigger?.message_type === 'video') && (
                    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Normal messages only deliver if the lead messaged you in the last 24 hours. Use Template for cold outreach.
                    </div>
                  )}

                  {!dayTrigger && (
                    <button
                      type="button"
                      onClick={() => upsertDayTrigger(selectedDay, emptyTrigger(selectedDay))}
                      className="text-sm text-emerald-700 hover:underline"
                    >
                      + Add message for this day
                    </button>
                  )}

                  {dayTrigger?.message_type === 'template' && (
                    <>
                      <label className="block text-sm">
                        <span className="font-medium">Template</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                          value={dayTrigger.template_id || ''}
                          onChange={(e) => {
                            const templateId = e.target.value || null
                            const tpl = templates.find((t) => t.id === templateId)
                            if (!tpl) {
                              upsertDayTrigger(selectedDay, {
                                template_id: null,
                                body_parameters: null,
                                header_parameters: null,
                              })
                              return
                            }
                            const { bodyCount, headerCount } = getTemplateParameterSlotCounts(tpl)
                            upsertDayTrigger(selectedDay, {
                              template_id: templateId,
                              body_parameters: bodyCount > 0 ? defaultParameterValues(bodyCount) : null,
                              header_parameters: headerCount > 0 ? defaultParameterValues(headerCount) : null,
                            })
                          }}
                        >
                          <option value="">Select template</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.language})
                            </option>
                          ))}
                        </select>
                      </label>
                      {dayTrigger.template_id && (() => {
                        const tpl = templates.find((t) => t.id === dayTrigger.template_id)
                        if (!tpl) return null
                        return (
                          <TemplateVariableMapper
                            template={tpl}
                            bodyParameters={dayTrigger.body_parameters ?? null}
                            headerParameters={dayTrigger.header_parameters ?? null}
                            onChange={(next) => upsertDayTrigger(selectedDay, next)}
                          />
                        )
                      })()}
                    </>
                  )}

                  {(dayTrigger?.message_type === 'text' ||
                    dayTrigger?.message_type === 'image' ||
                    dayTrigger?.message_type === 'video') && (
                    <label className="block text-sm">
                      <span className="font-medium">
                        {dayTrigger.message_type === 'text' ? 'Message' : 'Caption (optional)'}
                      </span>
                      <textarea
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                        rows={4}
                        value={dayTrigger.message_body || ''}
                        onChange={(e) => upsertDayTrigger(selectedDay, { message_body: e.target.value })}
                        placeholder="Hi {{lead_name}}, … Use {{lead_car}} for vehicle."
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Tokens: <code>{'{{lead_name}}'}</code>, <code>{'{{lead_car}}'}</code> — filled per lead on send.
                      </p>
                    </label>
                  )}

                  {(dayTrigger?.message_type === 'image' || dayTrigger?.message_type === 'video') && (
                    <div className="space-y-2">
                      <label className="block text-sm">
                        <span className="font-medium">
                          {dayTrigger.message_type === 'image' ? 'Image' : 'Video'} file{' '}
                          <span className="text-red-600">*</span>
                        </span>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Required before save. File uploads to storage and Meta for WhatsApp delivery.
                        </p>
                        <input
                          type="file"
                          className="mt-2 block w-full text-sm"
                          accept={dayTrigger.message_type === 'image' ? 'image/*' : 'video/*'}
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadMedia(f, dayTrigger.message_type as 'image' | 'video')
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {uploading && (
                        <p className="inline-flex items-center gap-2 text-xs text-slate-600">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Uploading…
                        </p>
                      )}
                      {!uploading && dayTrigger.media_url && (
                        <p className="text-xs text-emerald-700">
                          Uploaded ✓ {dayTrigger.media_file_name || 'media ready'}
                        </p>
                      )}
                      {!uploading && !dayTrigger.media_url && (
                        <p className="text-xs text-amber-700">No file uploaded yet — save will fail until you upload.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveFlow()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#128C7E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save flow
                </button>
                <button
                  type="button"
                  onClick={() => void deleteFlow(editing.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
