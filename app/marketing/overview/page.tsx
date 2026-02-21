'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2, FileEdit, CheckCircle, Clock, XCircle } from 'lucide-react'
import type { TemplateForOverview } from '../_lib/types'

export default function OverviewPage() {
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
            Throughput: default up to 80 messages/sec (up to 1,000 when upgraded). If you see error 130429, you&apos;re over the limit — wait and retry.{' '}
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/throughput" target="_blank" rel="noopener noreferrer" className="text-[#ed1b24] hover:underline">Throughput</a>
          </p>
        </div>
      </section>
    </div>
  )
}
