'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { TemplatePreview } from '../../_components/TemplatePreview'
import type { WhatsAppTemplate } from '../../_lib/types'
import { getLanguageName } from '../../_lib/utils'

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
    fetch(`/api/marketing/whatsapp/templates/${id}`, { credentials: 'include' })
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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#ed1b24]" />
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-800">{error ?? 'Template not found'}</p>
        <Link href="/marketing/templates" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#ed1b24] hover:underline">
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/marketing/templates"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to templates
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{template.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {getLanguageName(template.language)} · {template.category}
              {correctCategory && correctCategory !== template.category && (
                <span className="ml-2 text-amber-600">(Meta: {correctCategory})</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSendable ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                <CheckCircle className="h-4 w-4" /> Sendable
              </span>
            ) : status === 'pending' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                <Clock className="h-4 w-4" /> Awaiting review
              </span>
            ) : status === 'rejected' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                <XCircle className="h-4 w-4" /> Rejected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                <AlertCircle className="h-4 w-4" /> {status}
              </span>
            )}
          </div>
        </div>

        {metaTemplateId && (
          <p className="mt-2 text-xs text-gray-500">Meta template ID: {metaTemplateId}</p>
        )}
        {lastSyncAt && (
          <p className="mt-1 text-xs text-gray-500">Last synced: {new Date(lastSyncAt).toLocaleString()}</p>
        )}
        {template.rejection_reason && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            Rejection reason: {template.rejection_reason}
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Preview</h2>
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

      {(statusHistory.length > 0 || webhookEvents.length > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status & events</h2>
          {statusHistory.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Status history</h3>
              <ul className="space-y-2">
                {statusHistory.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-500">{new Date(h.created_at).toLocaleString()}</span>
                    <span className="text-gray-700">
                      {h.old_status ?? '—'} → {h.new_status ?? '—'}
                      {h.old_category !== h.new_category && (h.old_category || h.new_category) && (
                        <span className="text-gray-500"> · category: {h.old_category ?? '—'} → {h.new_category ?? '—'}</span>
                      )}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{h.source}</span>
                    {h.reason && <span className="text-amber-700">{h.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {webhookEvents.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">Webhook events</h3>
              <ul className="space-y-2">
                {webhookEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                    <span className="text-gray-500">{new Date(e.created_at).toLocaleString()}</span>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">{e.event_type}</span>
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
