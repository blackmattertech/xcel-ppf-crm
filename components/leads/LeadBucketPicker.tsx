'use client'

import { useEffect, useRef, useState } from 'react'
import { cachedFetch } from '@/lib/api-client'
import { ChevronDown, Loader2 } from 'lucide-react'

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

export const BUCKET_COLORS = [
  '#dd3f3c',
  '#ed1b24',
  '#c92a2a',
  '#e85d5d',
  '#717d8a',
  '#38a646',
  '#f59e0b',
  '#1f2937',
]

const selectClassName =
  'w-full text-[12px] font-semibold text-black leading-[1.3] border border-[#e0e0e0] rounded-[4px] px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#dd3f3c]/30 focus:border-[#dd3f3c] disabled:opacity-60 disabled:cursor-not-allowed'

export default function LeadBucketPicker({ leadId, canEdit }: LeadBucketPickerProps) {
  const [allBuckets, setAllBuckets] = useState<LeadBucketTag[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadBuckets()
  }, [leadId])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

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

  async function saveBuckets(next: Set<string>) {
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

  function toggleBucket(bucketId: string) {
    if (!canEdit || saving) return
    const next = new Set(selectedIds)
    if (next.has(bucketId)) {
      next.delete(bucketId)
    } else {
      next.add(bucketId)
    }
    void saveBuckets(next)
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

  const selectedLabels = allBuckets
    .filter((b) => selectedIds.has(b.id))
    .map((b) => b.name)

  const displayValue =
    selectedLabels.length > 0 ? selectedLabels.join(', ') : '— Not set —'

  if (!canEdit) {
    return (
      <p className="text-[12px] font-semibold text-black leading-[1.3]">
        {selectedLabels.length > 0 ? displayValue : '— Not set —'}
      </p>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => setOpen((v) => !v)}
        className={`${selectClassName} flex items-center justify-between gap-2 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{displayValue}</span>
        <ChevronDown size={14} className="shrink-0 text-[#717d8a]" />
      </button>
      {open && (
        <ul
          className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-[4px] border border-[#e0e0e0] bg-white shadow-md py-1"
          role="listbox"
          aria-multiselectable
        >
          {allBuckets.map((bucket) => {
            const checked = selectedIds.has(bucket.id)
            return (
              <li key={bucket.id} role="option" aria-selected={checked}>
                <label className="flex items-center gap-2 px-2 py-2 text-[12px] text-black cursor-pointer hover:bg-[#fafafa]">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => toggleBucket(bucket.id)}
                    className="rounded border-[#e0e0e0] text-[#dd3f3c] focus:ring-[#dd3f3c]/30"
                  />
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: bucket.color || '#dd3f3c' }}
                  />
                  <span className="font-medium truncate">{bucket.name}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {saving && (
        <p className="text-[10px] text-[#717d8a] mt-1 flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
          Saving...
        </p>
      )}
    </div>
  )
}
