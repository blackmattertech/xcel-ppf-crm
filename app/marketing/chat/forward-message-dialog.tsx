'use client'

import { useMemo, useEffect, useRef } from 'react'
import { X, Search, Loader2, Forward } from 'lucide-react'
import type { LeadRecipient } from '../_lib/types'
import type { CustomerRecipient } from '../_lib/types'
import { normalizePhoneForStorage } from '../_lib/utils'

type Recipient = LeadRecipient | CustomerRecipient

export type ForwardMessageDialogProps = {
  open: boolean
  onClose: () => void
  recipients: Recipient[]
  search: string
  onSearchChange: (value: string) => void
  selectedPhoneKeys: string[]
  onTogglePhone: (normalizedPhoneKey: string) => void
  onSelectAllVisible: (visibleKeys: string[]) => void
  onDeselectVisible: (visibleKeys: string[]) => void
  onClearSelection: () => void
  onForward: () => void
  busy: boolean
  messagesCount: number
}

export function ForwardMessageDialog({
  open,
  onClose,
  recipients,
  search,
  onSearchChange,
  selectedPhoneKeys,
  onTogglePhone,
  onSelectAllVisible,
  onDeselectVisible,
  onClearSelection,
  onForward,
  busy,
  messagesCount,
}: ForwardMessageDialogProps) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipients
    return recipients.filter(
      (r) => r.name.toLowerCase().includes(q) || r.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
    )
  }, [recipients, search])

  const visibleKeys = useMemo(() => filtered.map((r) => normalizePhoneForStorage(r.phone)), [filtered])

  const selectedInView = useMemo(
    () => visibleKeys.filter((k) => selectedPhoneKeys.includes(k)),
    [visibleKeys, selectedPhoneKeys]
  )

  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = selectedInView.length > 0 && selectedInView.length < visibleKeys.length
  }, [selectedInView.length, visibleKeys.length])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={() => !busy && onClose()}
        aria-label="Close"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-dialog-title"
        className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 id="forward-dialog-title" className="flex-1 text-center text-sm font-semibold text-gray-900 pr-8">
            Forward message{messagesCount > 1 ? 's' : ''} to
          </h2>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search name or number"
              className="w-full rounded-xl border border-[#25D366]/40 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#25D366]/25"
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/80 text-xs shrink-0">
          <label className="inline-flex items-center gap-2 cursor-pointer text-gray-700">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="rounded border-gray-300"
              checked={visibleKeys.length > 0 && selectedInView.length === visibleKeys.length}
              onChange={() => {
                if (visibleKeys.length === 0) return
                if (selectedInView.length === visibleKeys.length) {
                  onDeselectVisible(visibleKeys)
                } else {
                  onSelectAllVisible(visibleKeys)
                }
              }}
            />
            Select all{visibleKeys.length ? ` (${visibleKeys.length})` : ''}
          </label>
        </div>

        <ul className="flex-1 overflow-y-auto min-h-[200px] divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500">No contacts match your search.</li>
          ) : (
            filtered.map((r) => {
              const key = normalizePhoneForStorage(r.phone)
              const checked = selectedPhoneKeys.includes(key)
              return (
                <li key={`${r.type}-${r.id}-${key}`}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 shrink-0"
                      checked={checked}
                      onChange={() => onTogglePhone(key)}
                    />
                    <div className="h-10 w-10 rounded-full bg-[#25D366]/15 flex items-center justify-center shrink-0 text-sm font-semibold text-[#1f9d55]">
                      {(r.name || r.phone).trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name || r.phone}</p>
                      <p className="text-xs text-gray-500 truncate">{r.phone}</p>
                    </div>
                  </label>
                </li>
              )
            })
          )}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-900 px-4 py-3 text-white rounded-b-2xl shrink-0">
          <button
            type="button"
            onClick={onClearSelection}
            disabled={busy || selectedPhoneKeys.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-white/90 hover:bg-white/10 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
            {selectedPhoneKeys.length} selected
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={busy || selectedPhoneKeys.length === 0 || messagesCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20BA5A] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
            Forward
          </button>
        </div>
      </div>
    </div>
  )
}
