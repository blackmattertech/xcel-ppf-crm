'use client'

import { useEffect, useState } from 'react'
import { cachedFetch } from '@/lib/api-client'
import { Layers, Loader2 } from 'lucide-react'

export interface LeadBucketTag {
  id: string
  name: string
  color: string | null
  is_active: boolean
}

interface LeadBucketPickerProps {
  leadId: string
  canEdit: boolean
}

export const BUCKET_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444']

export default function LeadBucketPicker({ leadId, canEdit }: LeadBucketPickerProps) {
  const [allBuckets, setAllBuckets] = useState<LeadBucketTag[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadBuckets()
  }, [leadId])

  async function loadBuckets() {
    setLoading(true)
    setError('')
    try {
      const [catalogRes, leadRes] = await Promise.all([
        cachedFetch('/api/buckets?active_only=true'),
        cachedFetch(`/api/leads/${leadId}/buckets`),
      ])

      if (!catalogRes.ok || !leadRes.ok) {
        throw new Error('Failed to load buckets')
      }

      const catalog = await catalogRes.json()
      const leadData = await leadRes.json()
      const activeCatalog = (Array.isArray(catalog) ? catalog : []).filter(
        (b: LeadBucketTag) => b.is_active
      )
      const assigned = (leadData.buckets || []) as LeadBucketTag[]

      setAllBuckets(activeCatalog)
      setSelectedIds(new Set(assigned.map((b) => b.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load buckets')
    } finally {
      setLoading(false)
    }
  }

  async function toggleBucket(bucketId: string) {
    if (!canEdit || saving) return

    const next = new Set(selectedIds)
    if (next.has(bucketId)) {
      next.delete(bucketId)
    } else {
      next.add(bucketId)
    }
    setSelectedIds(next)

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/leads/${leadId}/buckets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketIds: [...next] }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save buckets')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      void loadBuckets()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#717d8a] py-2">
        <Loader2 size={14} className="animate-spin" />
        Loading buckets...
      </div>
    )
  }

  if (allBuckets.length === 0) {
    return (
      <p className="text-[12px] text-[#717d8a]">No buckets yet. Admin can create buckets from the Lead Buckets page.</p>
    )
  }

  return (
    <div>
      {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {allBuckets.map((bucket) => {
          const isSelected = selectedIds.has(bucket.id)
          const color = bucket.color || '#6366f1'
          return (
            <button
              key={bucket.id}
              type="button"
              disabled={!canEdit || saving}
              onClick={() => void toggleBucket(bucket.id)}
              className={`px-3 py-1.5 rounded-[3px] text-[11px] font-medium leading-none border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                isSelected ? 'text-white border-transparent' : 'bg-white text-gray-700 border-[#e0e0e0] hover:border-gray-400'
              }`}
              style={isSelected ? { backgroundColor: color, borderColor: color } : undefined}
              title={canEdit ? `Click to ${isSelected ? 'remove' : 'add'}` : undefined}
            >
              <span className="inline-flex items-center gap-1">
                <Layers size={11} />
                {bucket.name}
              </span>
            </button>
          )
        })}
      </div>
      {saving && (
        <p className="text-[10px] text-[#717d8a] mt-2 flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
          Saving...
        </p>
      )}
      {!canEdit && selectedIds.size === 0 && (
        <p className="text-[12px] text-[#717d8a] mt-1">No buckets tagged</p>
      )}
    </div>
  )
}
