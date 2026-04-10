import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhoneForStorage } from '@/backend/services/whatsapp-chat.service'
import type { CallOutcome } from '@/backend/services/call-lead-journey.service'

export const MCUBE_OUTBOUND_URL = 'https://api.mcube.com/Restmcube-api/outbound-calls'
export const MCUBE_INBOUND_URL = process.env.MCUBE_INBOUND_API_URL?.trim() || ''

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
  const raw = String(value).trim()
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10)
    return Number.isNaN(n) ? null : n
  }
  const parts = raw.split(':').map((p) => parseInt(p, 10))
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
  if (s === 'ANSWER' || s === 'ANSWERED') return 'connected'
  if (s === 'CANCEL' || s === 'NOANSWER' || s === 'NO_ANSWER' || s === 'BUSY' || s === 'EXECUTIVE_BUSY') {
    return 'not_reachable'
  }
  return 'not_reachable'
}

/**
 * MCUBE often sends 10-digit domestic numbers; CRM may store +91…, spaces, or 91-prefixed digits.
 * Exact `.in('phone', …)` misses when DB has "+918217681871" and payload has "8217681871".
 */
export function buildLeadPhoneLookupVariants(rawPhone: string | undefined | null): string[] {
  if (!rawPhone?.trim()) return []
  const trimmed = rawPhone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10) return [trimmed]
  const last10 = digits.slice(-10)
  const normalized = normalizePhoneForStorage(trimmed)
  const set = new Set<string>([
    trimmed,
    normalized,
    last10,
    `91${last10}`,
    `+91${last10}`,
    `+91 ${last10}`,
    `+${normalized}`,
    `0${last10}`,
    trimmed.replace(/\s/g, ''),
  ])
  return [...set].filter(Boolean)
}

export async function findLeadIdByCustomerPhone(
  supabase: SupabaseClient,
  rawPhone: string | undefined | null
): Promise<string | null> {
  if (!rawPhone?.trim()) return null
  const trimmed = rawPhone.trim()
  const normalized = normalizePhoneForStorage(trimmed)
  const last10 = normalized.slice(-10)
  const variants = [...new Set([...buildLeadPhoneLookupVariants(rawPhone), normalized, last10, trimmed])]

  let rows =
    ((
      await supabase
        .from('leads')
        .select('id, phone, created_at, updated_at')
        .in('phone', variants)
    ).data as Array<{ id: string; phone: string; created_at: string; updated_at: string }> | null) ?? null

  if (!rows?.length) {
    const { data: fuzzy } = await supabase
      .from('leads')
      .select('id, phone, created_at, updated_at')
      .ilike('phone', `%${last10}%`)
      .limit(50)
    const raw = (fuzzy as Array<{ id: string; phone: string; created_at: string; updated_at: string }> | null) ?? null
    rows =
      raw?.filter((r) => normalizePhoneForStorage(r.phone).slice(-10) === last10) ?? null
  }

  if (!rows?.length) return null

  // Prefer the most recently created lead when duplicate phone variants exist.
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  return sorted[0]?.id ?? null
}

export async function findUserIdByAgentPhone(
  supabase: SupabaseClient,
  rawPhone: string | undefined | null
): Promise<string | null> {
  if (!rawPhone?.trim()) return null
  const variants = buildLeadPhoneLookupVariants(rawPhone)
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

function extractCallListFromUnknown(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const obj = payload as Record<string, unknown>
  const directKeys = ['data', 'calls', 'result', 'results', 'list', 'records']
  for (const key of directKeys) {
    const v = obj[key]
    if (Array.isArray(v)) return v
    if (v && typeof v === 'object') {
      const nested = extractCallListFromUnknown(v)
      if (nested.length > 0) return nested
    }
  }
  return []
}

function mapUnknownToMcubePayload(item: unknown): McubeWebhookPayload | null {
  if (!item || typeof item !== 'object') return null
  const r = item as Record<string, unknown>
  const callid = String(r.callid ?? r.call_id ?? r.callId ?? r.CallSessionId ?? '').trim()
  if (!callid) return null
  return {
    callid,
    starttime: String(r.starttime ?? r.start_time ?? r.startTime ?? r.StartTime ?? '').trim() || undefined,
    emp_phone: String(r.emp_phone ?? r.empPhone ?? r.agent_phone ?? r.SourceNumber ?? '').trim() || undefined,
    clicktocalldid: String(r.clicktocalldid ?? r.did ?? r.DisplayNumber ?? '').trim() || undefined,
    callto: String(r.callto ?? r.customer_number ?? r.custnumber ?? r.DestinationNumber ?? '').trim() || undefined,
    dialstatus: String(r.dialstatus ?? r.status ?? r.Status ?? '').trim() || undefined,
    filename: String(r.filename ?? r.recording ?? r.recording_url ?? r.ResourceURL ?? '').trim() || undefined,
    direction: String(r.direction ?? r.Direction ?? '').trim() || undefined,
    endtime: String(r.endtime ?? r.end_time ?? r.endTime ?? r.EndTime ?? '').trim() || undefined,
    disconnectedby: String(r.disconnectedby ?? r.disconnected_by ?? '').trim() || undefined,
    answeredtime: String(r.answeredtime ?? r.answered_time ?? r.CallDuration ?? '').trim() || undefined,
    groupname: String(r.groupname ?? r.group_name ?? '').trim() || undefined,
    agentname: String(r.agentname ?? r.agent_name ?? '').trim() || undefined,
  }
}

export async function fetchMcubeInboundCallsByPhone(params: {
  token: string
  phone: string
}): Promise<McubeWebhookPayload[]> {
  if (!MCUBE_INBOUND_URL) return []

  const digits = params.phone.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  const variants = [...new Set([last10, `91${last10}`, `+91${last10}`, params.phone.trim()])]

  for (const variant of variants) {
    const body = {
      HTTP_AUTHORIZATION: params.token,
      phone: variant,
      custnumber: variant,
      callto: variant,
      number: variant,
      destination: variant,
      customer_number: variant,
    }

    const res = await fetch(MCUBE_INBOUND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()

    if (!res.ok) {
      console.info('[mcube/inbound-sync] upstream_non_200', JSON.stringify({
        status: res.status,
        variant,
        body: text,
      }))
      continue
    }

    console.info('[mcube/inbound-sync] raw_response_text', JSON.stringify({ variant, text }))
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      continue
    }

    const rawList = extractCallListFromUnknown(parsed)
    const mapped = rawList
      .map((it) => mapUnknownToMcubePayload(it))
      .filter((v): v is McubeWebhookPayload => Boolean(v && v.callid))
    if (mapped.length > 0) {
      return mapped
    }
  }

  return []
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
