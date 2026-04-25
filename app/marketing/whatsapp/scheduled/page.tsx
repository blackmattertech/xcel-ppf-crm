'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Pencil,
  Users,
  Globe,
  Timer,
  AlertCircle,
} from 'lucide-react'

interface ListItem {
  id: string
  scheduledAt: string
  status: string
  createdAt: string
  templateName: string
  templateLanguage: string
  recipientCount: number
  delayMs: number
  errorMessage: string | null
}

interface DetailPayload {
  templateName: string
  templateLanguage: string
  delayMs: number
  defaultCountryCode: string
  headerParameters?: string[]
  recipients: Array<{ phone: string; bodyParameters?: string[] }>
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function recipientsToText(recipients: DetailPayload['recipients']) {
  return recipients.map((r) => r.phone).join('\n')
}

function parseRecipientsText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(',')
      if (idx === -1) return { phone: line.trim() }
      return {
        phone: line.slice(0, idx).trim(),
        name: line.slice(idx + 1).trim() || undefined,
      }
    })
    .filter((r) => r.phone.length > 0)
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900 ring-amber-200',
  processing: 'bg-sky-100 text-sky-900 ring-sky-200',
  completed: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  failed: 'bg-rose-100 text-rose-900 ring-rose-200',
}

export default function ScheduledBroadcastsPage() {
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [scheduledLocal, setScheduledLocal] = useState('')
  const [delayMs, setDelayMs] = useState(0)
  const [recipientsText, setRecipientsText] = useState('')
  const [bodyParamsText, setBodyParamsText] = useState('')
  const [headerParamsText, setHeaderParamsText] = useState('')
  const [detailMeta, setDetailMeta] = useState<{ templateName: string; templateLanguage: string } | null>(null)

  const loadList = useCallback(async () => {
    setListError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/whatsapp/scheduled-broadcasts', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const closeEdit = () => {
    setEditId(null)
    setEditError(null)
    setDetailMeta(null)
  }

  const openEdit = async (id: string) => {
    setEditId(id)
    setEditLoading(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/marketing/whatsapp/scheduled-broadcasts/${id}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load broadcast')
      const payload = data.payload as DetailPayload
      setDetailMeta({ templateName: payload.templateName, templateLanguage: payload.templateLanguage })
      setScheduledLocal(toDatetimeLocalValue(data.scheduledAt))
      setDelayMs(typeof payload.delayMs === 'number' ? payload.delayMs : 250)
      setRecipientsText(recipientsToText(payload.recipients ?? []))
      const firstBody = payload.recipients?.[0]?.bodyParameters
      setBodyParamsText(firstBody?.length ? firstBody.join(', ') : '')
      setHeaderParamsText(payload.headerParameters?.length ? payload.headerParameters.join(', ') : '')
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setEditLoading(false)
    }
  }

  const saveEdit = async () => {
    if (!editId) return
    setEditError(null)
    const recipients = parseRecipientsText(recipientsText)
    if (recipients.length === 0) {
      setEditError('Add at least one phone number (one per line).')
      return
    }
    const scheduledAt = scheduledLocal ? new Date(scheduledLocal).toISOString() : undefined
    const bodyParameters = bodyParamsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const headerParameters = headerParamsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    setEditLoading(true)
    try {
      const res = await fetch(`/api/marketing/whatsapp/scheduled-broadcasts/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt,
          recipients,
          bodyParameters: bodyParameters.length ? bodyParameters : undefined,
          headerParameters: headerParameters.length ? headerParameters : undefined,
          delayMs: Number(delayMs) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Update failed')
      closeEdit()
      await loadList()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#25D366]/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Link
              href="/marketing/whatsapp"
              className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90">Queue</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Scheduled broadcasts</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Jobs you scheduled from Bulk WhatsApp: template, contact count, send time. Pending ones can be edited.
              </p>
            </div>
          </div>
          <CalendarClock className="hidden h-16 w-16 shrink-0 text-white/20 sm:block" />
        </div>
      </div>

      {listError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {listError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-[#25D366]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
          <p className="text-slate-600">No scheduled broadcasts yet.</p>
          <Link
            href="/marketing/bulk-whatsapp"
            className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Schedule from Bulk WhatsApp →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Your scheduled jobs</h2>
            <p className="text-xs text-slate-500">Newest first. Only <strong>pending</strong> rows are editable.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3 text-right">Contacts</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 transition hover:bg-slate-50/80 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.templateName}</td>
                    <td className="px-4 py-3 text-slate-600">{row.templateLanguage}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{row.recipientCount}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(row.scheduledAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[row.status] ?? 'bg-slate-100 text-slate-800 ring-slate-200'}`}
                      >
                        {row.status}
                      </span>
                      {row.status === 'failed' && row.errorMessage && (
                        <p className="mt-1 max-w-xs truncate text-xs text-rose-600" title={row.errorMessage}>
                          {row.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => openEdit(row.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit drawer / modal */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="edit-scheduled-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="edit-scheduled-title" className="text-lg font-bold text-slate-900">
                  Edit scheduled broadcast
                </h2>
                {detailMeta && (
                  <p className="mt-1 text-sm text-slate-500">
                    Template <span className="font-semibold text-slate-800">{detailMeta.templateName}</span>
                    <span className="mx-1">·</span>
                    <Globe className="inline h-3.5 w-3.5" /> {detailMeta.templateLanguage}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            {editLoading && !detailMeta ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {editError && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {editError}
                  </div>
                )}
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Send at (your local time)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(e) => setScheduledLocal(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Timer className="h-3.5 w-3.5" />
                    Delay between sends (ms)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60000}
                    value={delayMs}
                    onChange={(e) => setDelayMs(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Users className="h-3.5 w-3.5" />
                    Recipients (one phone per line, optional: phone, name)
                  </label>
                  <textarea
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    rows={8}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
                    placeholder="919876543210&#10;919811223344, John"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Body parameters (comma-separated)</label>
                  <input
                    type="text"
                    value={bodyParamsText}
                    onChange={(e) => setBodyParamsText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Param1, Param2"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Header parameters (comma-separated, if template needs media URL / id)
                  </label>
                  <input
                    type="text"
                    value={headerParamsText}
                    onChange={(e) => setHeaderParamsText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    disabled={editLoading}
                    onClick={saveEdit}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#20BA5A] disabled:opacity-50"
                  >
                    {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    onClick={closeEdit}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
