'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'
import { computeEnrollmentDay } from '@/shared/whatsapp-automation-ist'

interface FlowOption {
  id: string
  name: string
  cycle_days: number
}

interface Enrollment {
  id: string
  flow_id: string
  status: string
  started_at: string
  cycle_number: number
  flow?: { id: string; name: string; cycle_days: number }
}

interface LeadAutomationEnrollProps {
  leadId: string
  canEnroll: boolean
}

export function LeadAutomationEnroll({ leadId, canEnroll }: LeadAutomationEnrollProps) {
  const [flows, setFlows] = useState<FlowOption[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedFlow, setSelectedFlow] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [flowsRes, enrRes] = await Promise.all([
        cachedFetch('/api/automation/whatsapp/flows?active_only=true'),
        cachedFetch(`/api/automation/whatsapp/enrollments?leadId=${leadId}`),
      ])
      const flowsData = await flowsRes.json()
      const enrData = await enrRes.json()
      if (flowsRes.ok) setFlows(flowsData.flows || [])
      if (enrRes.ok) setEnrollments(enrData.enrollments || [])
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  const active = enrollments.filter((e) => e.status === 'active')

  async function enroll() {
    if (!selectedFlow) return
    setBusy(true)
    try {
      const res = await cachedFetch('/api/automation/whatsapp/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: selectedFlow, lead_id: leadId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Enroll failed')
        return
      }
      setSelectedFlow('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function cancel(enrollmentId: string) {
    setBusy(true)
    try {
      const res = await cachedFetch(
        `/api/automation/whatsapp/enrollments?enrollmentId=${enrollmentId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Cancel failed')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[#717d8a]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading automation…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {active.length > 0 ? (
        <div className="space-y-2">
          {active.map((e) => {
            const day = computeEnrollmentDay(e.started_at)
            const total = e.flow?.cycle_days ?? '?'
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-emerald-200 bg-emerald-50/50 px-3 py-2"
              >
                <div>
                  <p className="text-[11px] font-medium text-emerald-900">{e.flow?.name || 'Flow'}</p>
                  <p className="text-[10px] text-emerald-700">
                    Day {day} of {total} · cycle {e.cycle_number}
                  </p>
                </div>
                {canEnroll && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancel(e.id)}
                    className="text-[10px] text-red-600 hover:underline disabled:opacity-50"
                  >
                    Leave flow
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[11px] text-[#717d8a]">Not in any automation flow.</p>
      )}

      {canEnroll && flows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="text-[11px] rounded-[3px] border border-gray-200 px-2 py-1.5 bg-white"
            value={selectedFlow}
            onChange={(e) => setSelectedFlow(e.target.value)}
          >
            <option value="">Enroll in flow…</option>
            {flows
              .filter((f) => !active.some((e) => e.flow_id === f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.cycle_days}d)
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!selectedFlow || busy}
            onClick={() => void enroll()}
            className="text-[11px] px-2 py-1.5 rounded-[3px] bg-[#128C7E] text-white disabled:opacity-50"
          >
            Enroll
          </button>
          <button type="button" onClick={() => void load()} className="p-1 text-[#717d8a]">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
