import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhoneForStorage } from '@/backend/services/whatsapp-chat.service'
import type { CallOutcome } from '@/backend/services/call-lead-journey.service'

export const MCUBE_OUTBOUND_URL = 'https://api.mcube.com/Restmcube-api/outbound-calls'

/**
 * MCUBE outbound API expects domestic numbers **without** country code (10 digits for India).
 * Our storage normalizes to digits with 91 prefix; strip to last 10 for the dial API.
 */
export function formatPhoneForMcubeDial(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

/** MCUBE timestamps are typically IST (Asia/Kolkata) without offset. */
export function parseMcubeTimestamp(value: string | undefined | null): string | null {
  if (!value || !String(value).trim()) return null
  const s = String(value).trim().replace(' ', 'T')
  const d = new Date(`${s}+05:30`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Parses "HH:MM:SS" or "M:SS" to seconds. */
export function parseAnsweredTimeToSeconds(value: string | undefined | null): number | null {
  if (!value || !String(value).trim()) return null
  const parts = String(value).trim().split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return null
}

export function mapDialStatusToOutcome(dialstatus: string | undefined | null): CallOutcome {
  const s = (dialstatus ?? '').trim().toUpperCase().replace(/\s+/g, '_')
  if (s === 'ANSWER') return 'connected'
  if (s === 'CANCEL' || s === 'NOANSWER' || s === 'NO_ANSWER' || s === 'BUSY' || s === 'EXECUTIVE_BUSY') {
    return 'not_reachable'
  }
  return 'not_reachable'
}

export async function findLeadIdByCustomerPhone(
  supabase: SupabaseClient,
  rawPhone: string | undefined | null
): Promise<string | null> {
  if (!rawPhone?.trim()) return null
  const trimmed = rawPhone.trim()
  const normalized = normalizePhoneForStorage(trimmed)
  const last10 = normalized.slice(-10)
  const variants = [...new Set([normalized, last10, trimmed])]
  const { data } = await supabase.from('leads').select('id').in('phone', variants).limit(1)
  const rows = data as { id: string }[] | null
  return rows?.[0]?.id ?? null
}

export async function findUserIdByAgentPhone(
  supabase: SupabaseClient,
  rawPhone: string | undefined | null
): Promise<string | null> {
  if (!rawPhone?.trim()) return null
  const trimmed = rawPhone.trim()
  const normalized = normalizePhoneForStorage(trimmed)
  const last10 = normalized.slice(-10)
  const variants = [...new Set([normalized, last10, trimmed])]
  const { data } = await supabase.from('users').select('id').in('phone', variants).limit(1)
  const rows = data as { id: string }[] | null
  return rows?.[0]?.id ?? null
}

export interface McubeWebhookPayload {
  starttime?: string
  callid: string
  emp_phone?: string
  clicktocalldid?: string
  callto?: string
  dialstatus?: string
  filename?: string
  direction?: string
  endtime?: string
  disconnectedby?: string
  answeredtime?: string
  groupname?: string
  agentname?: string
  refid?: string
  event?: string
}

export function isHangupEvent(payload: McubeWebhookPayload): boolean {
  const end = payload.endtime?.trim()
  if (end) return true
  return false
}

export async function triggerMcubeOutbound(params: {
  token: string
  exenumber: string
  custnumber: string
  refid: string
  refurl?: string | number
}): Promise<{ ok: boolean; status: number; body: string }> {
  const { token, exenumber, custnumber, refid, refurl = 1 } = params
  const res = await fetch(MCUBE_OUTBOUND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      HTTP_AUTHORIZATION: token,
      exenumber,
      custnumber,
      refurl,
      refid,
    }),
  })
  const text = await res.text()
  let ok = res.ok
  if (res.ok && text.trim()) {
    try {
      const j = JSON.parse(text) as {
        status?: string
        Status?: string
        success?: boolean
        msg?: string
        message?: string
      }
      const st = String(j.status ?? j.Status ?? '').toLowerCase()
      if (st && !['succ', 'success', '1', 'ok', 'true'].includes(st)) {
        ok = false
      }
      if (j.success === false) {
        ok = false
      }
    } catch {
      // non-JSON success body — keep HTTP ok
    }
  }
  return { ok, status: res.status, body: text }
}

/**
 * Resolve MCUBE refurl.
 * Priority:
 * 1) MCUBE_REFURL env
 * 2) Public app URL + webhook path (with secret query, if available)
 * 3) numeric fallback 1
 */
export function resolveMcubeRefurl(): string | number {
  const raw = process.env.MCUBE_REFURL?.trim()
  if (raw) {
    const n = Number(raw)
    if (!Number.isNaN(n) && String(n) === raw) return n
    return raw
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    const base = appUrl.replace(/\/$/, '')
    const secret = process.env.MCUBE_WEBHOOK_SECRET?.trim()
    if (secret) {
      return `${base}/api/webhooks/mcube?secret=${encodeURIComponent(secret)}`
    }
    return `${base}/api/webhooks/mcube`
  }

  return 1
}
