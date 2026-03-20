'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Loader2,
  Send,
  Inbox,
  MessageCircle,
  BarChart2,
  TrendingUp,
  FileText,
  Calendar,
  ArrowLeft,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Phone,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts'

const PIE_COLORS = ['#25D366', '#128C7E', '#34B7F1', '#6366f1', '#8b5cf6', '#f59e0b', '#64748b']
const STATUS_COLORS: Record<string, string> = {
  sent: '#25D366',
  delivered: '#128C7E',
  read: '#34B7F1',
  pending: '#f59e0b',
  failed: '#ef4444',
}

interface WhatsAppAnalyticsData {
  messagesByDirection: Record<string, number>
  messagesByStatus: Record<string, number>
  messagesOverTime: Array<{ date: string; sent: number; received: number; total: number }>
  messagesByTemplate: Array<{ template: string; count: number }>
  totals: { sent: number; received: number; total: number }
  period: { startDate: string; endDate: string }
}

const PERIOD_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const

interface DeliveryStatusItem {
  phone: string
  lead_id: string | null
  lead_name: string | null
}
interface DeliveryStatusResponse {
  byStatus: Record<string, { count: number; items: DeliveryStatusItem[] }>
  summary: {
    pending: number
    sent: number
    delivered: number
    read: number
    failed: number
    notDelivered: number
    notRead: number
  }
}

export default function WhatsAppAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<WhatsAppAnalyticsData | null>(null)
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - periodDays)
    const startDate = start.toISOString()
    const endDate = end.toISOString()

    Promise.all([
      fetch(
        `/api/marketing/whatsapp/analytics?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { credentials: 'include' }
      ).then((res) => {
        if (!res.ok) throw new Error('Failed to load analytics')
        return res.json()
      }),
      fetch(
        `/api/marketing/whatsapp/delivery-status?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { credentials: 'include' }
      ).then((res) => (res.ok ? res.json() : { byStatus: {}, summary: { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, notDelivered: 0, notRead: 0 } })),
    ])
      .then(([analyticsData, deliveryData]) => {
        setData(analyticsData)
        setDeliveryStatus(deliveryData)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [periodDays])

  const directionPieData = useMemo(() => {
    if (!data?.messagesByDirection) return []
    return [
      { name: 'Outgoing', value: data.messagesByDirection.out ?? 0 },
      { name: 'Incoming', value: data.messagesByDirection.in ?? 0 },
    ].filter((d) => d.value > 0)
  }, [data])

  const statusPieData = useMemo(() => {
    if (!data?.messagesByStatus) return []
    const order = ['sent', 'delivered', 'read', 'pending']
    return order
      .filter((k) => (data.messagesByStatus[k] ?? 0) > 0)
      .map((k) => ({
        name: k.charAt(0).toUpperCase() + k.slice(1),
        value: data.messagesByStatus[k] ?? 0,
        key: k,
      }))
  }, [data])

  const messagesOverTimeChart = useMemo(() => {
    if (!data?.messagesOverTime?.length) return []
    return data.messagesOverTime.map((d) => ({
      ...d,
      shortDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }))
  }, [data])

  const templateBarData = useMemo(() => {
    if (!data?.messagesByTemplate?.length) return []
    return data.messagesByTemplate.map((d) => ({
      name: d.template.length > 14 ? d.template.slice(0, 12) + '…' : d.template,
      fullName: d.template,
      count: d.count,
    }))
  }, [data])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/marketing/whatsapp"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">WhatsApp Analytics</h1>
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-[#25D366]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/marketing/whatsapp"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            title="Back to WhatsApp"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">WhatsApp Analytics</h1>
            <p className="text-sm text-gray-500">
              Message volume, delivery status, and template usage
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setPeriodDays(opt.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodDays === opt.days
                  ? 'bg-[#25D366] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          {error}
        </div>
      )}

      {!data && !error && null}

      {data && (
        <>
          {/* Totals */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
                  <Send className="h-6 w-6 text-[#25D366]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Messages sent</p>
                  <p className="text-2xl font-bold text-gray-900">{data.totals.sent}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#128C7E]/10 flex items-center justify-center">
                  <Inbox className="h-6 w-6 text-[#128C7E]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Messages received</p>
                  <p className="text-2xl font-bold text-gray-900">{data.totals.received}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#34B7F1]/10 flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-[#34B7F1]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Total messages</p>
                  <p className="text-2xl font-bold text-gray-900">{data.totals.total}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Messages by direction */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Messages by direction
            </h2>
            {directionPieData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={directionPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {directionPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">No message data in this period</p>
            )}
          </section>

          {/* Messages by status (outgoing) */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Outgoing message status (sent → delivered → read)
            </h2>
            {statusPieData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statusPieData.map((d) => (
                        <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">No outgoing messages in this period</p>
            )}
          </section>

          {/* Messages over time */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Messages over time
            </h2>
            {messagesOverTimeChart.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={messagesOverTimeChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                      formatter={(value: number, name: string) => [value, name === 'sent' ? 'Sent' : name === 'received' ? 'Received' : 'Total']}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="sent" stackId="1" stroke="#25D366" fill="#25D366" fillOpacity={0.6} name="Sent" />
                    <Area type="monotone" dataKey="received" stackId="1" stroke="#128C7E" fill="#128C7E" fillOpacity={0.6} name="Received" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">No message data in this period</p>
            )}
          </section>

          {/* Messages by template */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm overflow-hidden">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Messages sent by template
            </h2>
            {templateBarData.length > 0 ? (
              <>
                <div className="h-72 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={templateBarData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [value, 'Sent']} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''} />
                      <Bar dataKey="count" fill="#25D366" radius={[0, 4, 4, 0]} name="Sent" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-4 font-medium">Template name</th>
                        <th className="py-2 font-medium text-right">Messages sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.messagesByTemplate.map((row) => (
                        <tr key={row.template} className="border-b border-gray-50">
                          <td className="py-2.5 pr-4 text-gray-900">{row.template}</td>
                          <td className="py-2.5 text-right font-medium text-gray-700">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 py-8 text-center">No template messages sent in this period</p>
            )}
          </section>

          {/* Delivery status: leads/numbers not delivered, not read, failed */}
          {deliveryStatus && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm overflow-hidden">
              <h2 className="text-base font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Leads / numbers by delivery status
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Distinct leads or phone numbers with at least one outgoing message in this status (outgoing only).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                  <p className="text-sm font-medium text-amber-800">Not delivered</p>
                  <p className="text-2xl font-bold text-amber-900">{deliveryStatus.summary.notDelivered}</p>
                  <p className="text-xs text-amber-700 mt-0.5">Pending or sent only</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                  <p className="text-sm font-medium text-blue-800">Not read</p>
                  <p className="text-2xl font-bold text-blue-900">{deliveryStatus.summary.notRead}</p>
                  <p className="text-xs text-blue-700 mt-0.5">Pending, sent, or delivered</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                  <p className="text-sm font-medium text-red-800">Failed</p>
                  <p className="text-2xl font-bold text-red-900">{deliveryStatus.summary.failed}</p>
                  <p className="text-xs text-red-700 mt-0.5">Delivery failed (Meta)</p>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { key: 'failed', label: 'Failed', summary: deliveryStatus.summary.failed, color: 'red' },
                  { key: 'pending', label: 'Pending', summary: deliveryStatus.summary.pending, color: 'amber' },
                  { key: 'sent', label: 'Sent (not delivered)', summary: deliveryStatus.summary.sent, color: 'gray' },
                  { key: 'delivered', label: 'Delivered (not read)', summary: deliveryStatus.summary.delivered, color: 'blue' },
                  { key: 'read', label: 'Read', summary: deliveryStatus.summary.read, color: 'green' },
                ].map(({ key, label, summary }) => {
                  const isExpanded = expandedStatus === key
                  const items = deliveryStatus.byStatus[key]?.items ?? []
                  return (
                    <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedStatus(isExpanded ? null : key)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-2 font-medium text-gray-900">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {label}
                        </span>
                        <span className="text-lg font-bold text-gray-700">{summary}</span>
                      </button>
                      {isExpanded && items.length > 0 && (
                        <div className="border-t border-gray-100 max-h-48 overflow-y-auto bg-gray-50/50">
                          <ul className="divide-y divide-gray-100">
                            {items.map((item, i) => (
                              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                                <span className="truncate text-gray-900">{item.lead_name || item.phone}</span>
                                <span className="font-mono text-gray-500 shrink-0">{item.phone}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {deliveryStatus.summary.failed > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <Link
                    href="/marketing/bulk-whatsapp?retry=failed"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#20BA5A]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry failed campaign
                  </Link>
                  <p className="text-xs text-gray-500 mt-2">Opens Bulk WhatsApp with failed numbers pre-filled so you can resend.</p>
                </div>
              )}
            </section>
          )}

          {/* Period note */}
          <p className="text-xs text-gray-500">
            Period: {new Date(data.period.startDate).toLocaleDateString()} – {new Date(data.period.endDate).toLocaleDateString()}.
            Data is based on messages stored in the CRM (outgoing from send-template / chat; incoming from webhook).
          </p>
        </>
      )}
    </div>
  )
}
