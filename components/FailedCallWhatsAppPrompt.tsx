'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthContext } from './AuthProvider'
import { cachedFetch } from '@/lib/api-client'
import { Loader2, MessageCircle, PhoneOff, X } from 'lucide-react'

interface PromptLead {
  id: string
  lead_id?: string
  name: string
  phone: string | null
}

interface FailedCallPrompt {
  id: string
  mcube_call_id: string
  lead_id: string
  dial_status: string | null
  message_preview: string | null
  created_at: string
  lead?: PromptLead | null
}

export default function FailedCallWhatsAppPrompt() {
  const { isAuthenticated } = useAuthContext()
  const [prompts, setPrompts] = useState<FailedCallPrompt[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activePrompt = prompts[activeIndex] ?? null

  const loadPrompts = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await cachedFetch('/api/integrations/mcube/failed-call-whatsapp/prompts', undefined, 0)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      const next = Array.isArray(data.prompts) ? (data.prompts as FailedCallPrompt[]) : []
      setPrompts(next)
      setActiveIndex((idx) => (next.length === 0 ? 0 : Math.min(idx, next.length - 1)))
    } catch {
      /* silent poll */
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    void loadPrompts()
    const intervalId = window.setInterval(() => void loadPrompts(), 5000)
    return () => window.clearInterval(intervalId)
  }, [isAuthenticated, loadPrompts])

  async function respond(action: 'approve' | 'dismiss') {
    if (!activePrompt || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/integrations/mcube/failed-call-whatsapp/prompts/${activePrompt.id}/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Something went wrong')
        return
      }
      if (action === 'approve' && data.error) {
        setError(String(data.error))
      }
      await loadPrompts()
    } catch {
      setError('Failed to save your choice')
    } finally {
      setBusy(false)
    }
  }

  if (!activePrompt) return null

  const leadName = activePrompt.lead?.name || 'Lead'
  const leadPhone = activePrompt.lead?.phone || '—'
  const leadHref = `/leads/${activePrompt.lead_id}`
  const queueNote =
    prompts.length > 1 ? `${activeIndex + 1} of ${prompts.length} waiting` : null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="failed-call-wa-title"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="bg-gradient-to-r from-[#128C7E] to-[#25D366] px-5 py-4 text-white">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <PhoneOff className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="failed-call-wa-title" className="text-lg font-bold leading-tight">
                Call did not connect
              </h2>
              <p className="text-sm text-white/90 mt-0.5">
                Send WhatsApp follow-up to this lead?
              </p>
            </div>
            {queueNote ? (
              <span className="text-[11px] font-medium bg-white/20 px-2 py-1 rounded-full shrink-0">
                {queueNote}
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lead</p>
            <Link href={leadHref} className="text-base font-semibold text-gray-900 hover:text-[#dd3f3c] mt-1 block">
              {leadName}
            </Link>
            <p className="text-sm text-gray-600 mt-1">{leadPhone}</p>
            {activePrompt.dial_status ? (
              <p className="text-xs text-gray-400 mt-2">Dial status: {activePrompt.dial_status}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-[#dcf8c6] bg-[#f0fdf4] p-4">
            <div className="flex items-center gap-2 text-[#128C7E] mb-2">
              <MessageCircle className="w-4 h-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Message preview</p>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {activePrompt.message_preview || 'WhatsApp follow-up message'}
            </p>
          </div>

          {error ? (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          <p className="text-xs text-gray-500 text-center">
            You must choose — message only sends if you approve.
          </p>
        </div>

        <div className="px-5 pb-5 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond('approve')}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#25D366] text-white font-semibold text-sm hover:bg-[#1fb855] disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            Send follow-up
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond('dismiss')}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            Don&apos;t send
          </button>
        </div>
      </div>
    </div>
  )
}
