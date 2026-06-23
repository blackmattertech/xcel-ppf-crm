'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Link2, Unlink } from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

interface FlowOption {
  id: string
  name: string
  cycle_days: number
}

interface BucketLink {
  id: string
  flow_id: string
  bucket_id: string
  is_active: boolean
  flow?: { id: string; name: string; cycle_days: number; is_active: boolean }
}

interface BucketAutomationLinksProps {
  bucketId: string
  canEnroll: boolean
}

export function BucketAutomationLinks({ bucketId, canEnroll }: BucketAutomationLinksProps) {
  const [flows, setFlows] = useState<FlowOption[]>([])
  const [links, setLinks] = useState<BucketLink[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedFlow, setSelectedFlow] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [flowsRes, linksRes] = await Promise.all([
        cachedFetch('/api/automation/whatsapp/flows?active_only=true'),
        cachedFetch(`/api/automation/whatsapp/bucket-links?bucketId=${bucketId}`),
      ])
      const flowsData = await flowsRes.json()
      const linksData = await linksRes.json()
      if (flowsRes.ok) setFlows(flowsData.flows || [])
      if (linksRes.ok) setLinks(linksData.links || [])
    } finally {
      setLoading(false)
    }
  }, [bucketId])

  useEffect(() => {
    void load()
  }, [load])

  const activeLinks = links.filter((l) => l.is_active)

  async function linkFlow() {
    if (!selectedFlow) return
    setBusy(true)
    try {
      const res = await cachedFetch('/api/automation/whatsapp/bucket-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: selectedFlow, bucket_id: bucketId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Link failed')
        return
      }
      setSelectedFlow('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function unlink(flowId: string) {
    setBusy(true)
    try {
      const res = await cachedFetch(
        `/api/automation/whatsapp/bucket-links?flowId=${flowId}&bucketId=${bucketId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Unlink failed')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Automation…</p>
  }

  return (
    <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-slate-50/50">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">WhatsApp automation</p>
      <p className="text-[11px] text-gray-500">All leads in this bucket get flow messages. New tags auto-enroll.</p>

      {activeLinks.length > 0 ? (
        <ul className="space-y-1">
          {activeLinks.map((l) => (
            <li key={l.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-800">{l.flow?.name || 'Flow'}</span>
              {canEnroll && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void unlink(l.flow_id)}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                >
                  <Unlink className="h-3 w-3" />
                  Unlink
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400">No flows linked.</p>
      )}

      {canEnroll && flows.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <select
            className="text-xs rounded border border-gray-200 px-2 py-1"
            value={selectedFlow}
            onChange={(e) => setSelectedFlow(e.target.value)}
          >
            <option value="">Link to flow…</option>
            {flows
              .filter((f) => !activeLinks.some((l) => l.flow_id === f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!selectedFlow || busy}
            onClick={() => void linkFlow()}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#128C7E] text-white disabled:opacity-50"
          >
            <Link2 className="h-3 w-3" />
            Link
          </button>
        </div>
      )}
    </div>
  )
}
