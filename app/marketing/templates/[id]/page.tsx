'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Clock, CheckCircle, XCircle, AlertCircle, Sparkles } from 'lucide-react'
import { TemplatePreview } from '../../_components/TemplatePreview'
import type { WhatsAppTemplate } from '../../_lib/types'
import { getLanguageName } from '../../_lib/utils'
import { cachedFetch } from '@/lib/api-client'
import { cardShellFlat, heroShell, sectionLabel } from '../../_lib/marketing-ui'

interface StatusHistoryEntry {
  id: string
  old_status: string | null
  new_status: string | null
  old_category: string | null
  new_category: string | null
  source: string
  reason: string | null
  created_at: string
}

interface WebhookEvent {
  id: string
  event_type: string
  created_at: string
  payload_json?: unknown
}

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null)
  const [template, setTemplate] = useState<WhatsAppTemplate | null>(null)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    cachedFetch(`/api/marketing/whatsapp/templates/${id}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
          return
        }
        setTemplate(data.template)
        setStatusHistory(Array.isArray(data.statusHistory) ? data.statusHistory : [])
        setWebhookEvents(Array.isArray(data.webhookEvents) ? data.webhookEvents : [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading || !id) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200/80 bg-red-50/90 p-8 ring-1 ring-red-100">
        <p className="font-medium text-red-900">{error ?? 'Template not found'}</p>
        <Link
          href="/marketing/templates"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to templates
        </Link>
      </div>
    )
  }

  const status = (template as { meta_status?: string }).meta_status ?? template.status
  const isSendable = status === 'approved' || status === 'active'
  const correctCategory = (template as { correct_category?: string }).correct_category
  const metaTemplateId = (template as { meta_template_id?: string }).meta_template_id ?? template.meta_id
  const lastSyncAt = (template as { last_sync_at?: string }).last_sync_at

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div className={heroShell}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#25D366]/20 blur-3xl" />
        <Link
          href="/marketing/templates"
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition hover:bg-white/20"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Templates
        </Link>
        <div className="relative mt-4">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
            <Sparkles className="h-3.5 w-3.5" />
            Detail
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{template.name}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {getLanguageName(template.language)} · {template.category}
            {correctCategory && correctCategory !== template.category && (
              <span className="ml-2 text-amber-300">(Meta: {correctCategory})</span>
            )}
          </p>
        </div>
      </div>

      <div className={cardShellFlat}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={sectionLabel}>Status</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {isSendable ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">
                  <CheckCircle className="h-4 w-4" /> Sendable
                </span>
              ) : status === 'pending' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                  <Clock className="h-4 w-4" /> Awaiting review
                </span>
              ) : status === 'rejected' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-900">
                  <XCircle className="h-4 w-4" /> Rejected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
                  <AlertCircle className="h-4 w-4" /> {status}
                </span>
              )}
            </div>
          </div>
        </div>

        {metaTemplateId && (
          <p className="mt-4 font-mono text-xs text-slate-500">Meta template ID: {metaTemplateId}</p>
        )}
        {lastSyncAt && (
          <p className="mt-1 text-xs text-slate-500">Last synced: {new Date(lastSyncAt).toLocaleString()}</p>
        )}
        {template.rejection_reason && (
          <div className="mt-4 rounded-xl border border-red-200/80 bg-red-50/90 p-4 text-sm text-red-900">
            <strong>Rejection reason:</strong> {template.rejection_reason}
          </div>
        )}

        <div className="mt-8 border-t border-slate-100 pt-6">
          <p className={sectionLabel}>Preview</p>
          <div className="mt-3">
            <TemplatePreview
              headerFormat={(template.header_format as string) ?? 'TEXT'}
              headerText={template.header_text ?? ''}
              headerMediaUrl={template.header_media_url ?? ''}
              body={template.body_text}
              footer={template.footer_text ?? ''}
              buttons={template.buttons?.filter((b) => b?.text) ?? []}
            />
          </div>
        </div>
      </div>

      {(statusHistory.length > 0 || webhookEvents.length > 0) && (
        <div className={cardShellFlat}>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Status &amp; events</h2>
          {statusHistory.length > 0 && (
            <div className="mt-5">
              <p className={`${sectionLabel} mb-3`}>Status history</p>
              <ul className="space-y-3">
                {statusHistory.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                    <span className="text-slate-500">{new Date(h.created_at).toLocaleString()}</span>
                    <span className="text-slate-800">
                      {h.old_status ?? '—'} → {h.new_status ?? '—'}
                      {h.old_category !== h.new_category && (h.old_category || h.new_category) && (
                        <span className="text-slate-500">
                          {' '}
                          · category: {h.old_category ?? '—'} → {h.new_category ?? '—'}
                        </span>
                      )}
                    </span>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{h.source}</span>
                    {h.reason && <span className="text-amber-800">{h.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {webhookEvents.length > 0 && (
            <div className={statusHistory.length > 0 ? 'mt-8' : ''}>
              <p className={`${sectionLabel} mb-3`}>Webhook events</p>
              <ul className="space-y-2">
                {webhookEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                    <span className="text-slate-500">{new Date(e.created_at).toLocaleString()}</span>
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900 ring-1 ring-sky-100">{e.event_type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
