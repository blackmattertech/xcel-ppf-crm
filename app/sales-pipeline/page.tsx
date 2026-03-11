'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import {
  LEAD_STATUS,
  LEAD_STATUS_LABELS,
} from '@/shared/constants/lead-status'
import {
  Sparkles,
  ArrowRight,
  Users,
  TrendingUp,
  FileCheck,
  Handshake,
  Trophy,
  XCircle,
  Loader2,
} from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

// Pipeline stages: group statuses for a clear visual flow. First status in each group is used for the "View" link.
const PIPELINE_STAGES: {
  key: string
  label: string
  description: string
  statuses: string[]
  icon: React.ComponentType<{ className?: string }>
  accent: string
  bgLight: string
  borderColor: string
}[] = [
  {
    key: 'new',
    label: 'New & Contacted',
    description: 'Fresh leads to reach out',
    statuses: [LEAD_STATUS.NEW, LEAD_STATUS.CONTACTED],
    icon: Sparkles,
    accent: 'text-amber-600',
    bgLight: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    key: 'qualified',
    label: 'Qualified',
    description: 'Assessed fit',
    statuses: [LEAD_STATUS.QUALIFIED, LEAD_STATUS.UNQUALIFIED],
    icon: Users,
    accent: 'text-sky-600',
    bgLight: 'bg-sky-50',
    borderColor: 'border-sky-200',
  },
  {
    key: 'quotation',
    label: 'Quotation',
    description: 'Quote shared or viewed',
    statuses: [
      LEAD_STATUS.QUOTATION_SHARED,
      LEAD_STATUS.QUOTATION_VIEWED,
      LEAD_STATUS.QUOTATION_ACCEPTED,
      LEAD_STATUS.QUOTATION_EXPIRED,
    ],
    icon: FileCheck,
    accent: 'text-violet-600',
    bgLight: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
  {
    key: 'interested',
    label: 'Interested & Negotiation',
    description: 'In discussion',
    statuses: [LEAD_STATUS.INTERESTED, LEAD_STATUS.NEGOTIATION],
    icon: Handshake,
    accent: 'text-emerald-600',
    bgLight: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  {
    key: 'won',
    label: 'Won & Payment',
    description: 'Deal closed or in payment',
    statuses: [
      LEAD_STATUS.DEAL_WON,
      LEAD_STATUS.PAYMENT_PENDING,
      LEAD_STATUS.ADVANCE_RECEIVED,
    ],
    icon: Trophy,
    accent: 'text-green-600',
    bgLight: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  {
    key: 'closed',
    label: 'Closed',
    description: 'Converted, lost or discarded',
    statuses: [LEAD_STATUS.CONVERTED, LEAD_STATUS.LOST, LEAD_STATUS.DISCARDED],
    icon: XCircle,
    accent: 'text-slate-600',
    bgLight: 'bg-slate-50',
    borderColor: 'border-slate-200',
  },
]

export default function SalesPipelinePage() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchCounts() {
      try {
        const res = await cachedFetch('/api/leads/counts-by-status')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setCounts(data.counts ?? {})
        }
      } catch {
        if (!cancelled) setCounts({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchCounts()
    return () => {
      cancelled = true
    }
  }, [])

  const totalLeads = Object.values(counts).reduce((a, b) => a + b, 0)

  const getStageCount = (statuses: string[]) =>
    statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0)

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50/80 via-white to-slate-50/60">
        {/* Header */}
        <div className="border-b border-slate-200/80 bg-white/70 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-1">
              <h1 className="font-semibold tracking-tight text-slate-900 text-2xl sm:text-3xl">
                Sales Pipeline
              </h1>
              <p className="text-slate-500 text-sm sm:text-base max-w-xl">
                Track leads through each stage from first contact to close.
              </p>
            </div>
            {!loading && (
              <div className="mt-6 flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                  <TrendingUp className="h-5 w-5 text-slate-400" />
                  <span className="text-slate-600 text-sm font-medium">
                    Total active leads
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-slate-900 text-sm font-semibold tabular-nums">
                    {totalLeads}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline */}
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
              <p className="text-slate-500 text-sm">Loading pipeline…</p>
            </div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {PIPELINE_STAGES.map((stage, idx) => {
                  const count = getStageCount(stage.statuses)
                  const Icon = stage.icon
                  const viewStatus = stage.statuses[0]
                  return (
                    <div
                      key={stage.key}
                      className="group flex flex-col rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300/80"
                      style={{
                        animationDelay: `${idx * 40}ms`,
                      }}
                    >
                      <div
                        className={`flex items-center gap-3 border-b px-5 py-4 ${stage.borderColor} ${stage.bgLight}`}
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ${stage.accent}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="font-semibold text-slate-900 text-sm leading-tight">
                            {stage.label}
                          </h2>
                          <p className="mt-0.5 truncate text-slate-500 text-xs">
                            {stage.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                          {count}
                        </p>
                        <p className="mt-1 text-slate-500 text-xs">
                          {count === 1 ? 'lead' : 'leads'}
                        </p>
                        <Link
                          href={`/leads?status=${encodeURIComponent(viewStatus)}`}
                          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
                        >
                          View leads
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Breakdown by status (optional, elegant list) */}
              <div className="mt-12 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
                <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
                  Count by status
                </h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  {(Object.keys(LEAD_STATUS_LABELS) as (keyof typeof LEAD_STATUS_LABELS)[]).map(
                    (status) => {
                      const n = counts[status] ?? 0
                      if (n === 0) return null
                      return (
                        <Link
                          key={status}
                          href={`/leads?status=${encodeURIComponent(status)}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
                        >
                          <span className="font-medium tabular-nums text-slate-900">
                            {n}
                          </span>
                          <span className="text-slate-500">
                            {LEAD_STATUS_LABELS[status]}
                          </span>
                        </Link>
                      )
                    }
                  )}
                  {Object.keys(counts).length === 0 && (
                    <p className="text-slate-500 text-sm">
                      No leads in pipeline yet.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
