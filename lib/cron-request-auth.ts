import type { NextRequest } from 'next/server'

type CronAuthOptions = {
  /**
   * When true, external callers must present a valid Bearer if `secret` is set;
   * if `secret` is unset, only `x-vercel-cron` is accepted (401 otherwise).
   */
  requireSecretForExternal?: boolean
}

function trimSecret(value: string | undefined): string | undefined {
  const t = value?.trim()
  return t || undefined
}

/** All configured cron secrets (trimmed, deduped). */
export function getCronSecrets(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [
    process.env.WHATSAPP_PROCESS_SCHEDULED_SECRET,
    process.env.CRON_SECRET,
  ]) {
    const s = trimSecret(raw)
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

/**
 * Prefer WhatsApp-specific cron secret, then shared CRON_SECRET (trimmed).
 * Use for server-to-server URLs that pass `?secret=` to internal routes.
 */
export function primaryProcessScheduledSecret(): string | undefined {
  return getCronSecrets()[0]
}

function tokenMatchesCandidates(token: string | undefined | null, candidates: string[]): boolean {
  if (!token) return false
  const t = token.trim()
  return t.length > 0 && candidates.includes(t)
}

/**
 * Authorize external cron HTTP calls (FastCron, curl, etc.).
 *
 * Accepts (in order):
 * - `x-vercel-cron: 1` (Vercel Cron)
 * - `Authorization: Bearer <CRON_SECRET>`
 * - `X-Cron-Secret: <CRON_SECRET>` (some schedulers use custom header)
 * - `?secret=<CRON_SECRET>` query param (FastCron-friendly when headers are awkward)
 *
 * Requires `CRON_SECRET` or `WHATSAPP_PROCESS_SCHEDULED_SECRET` in env for non-Vercel callers.
 */
export function isExternalCronAuthorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true

  const candidates = getCronSecrets()
  if (candidates.length === 0) return false

  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ') && tokenMatchesCandidates(auth.slice(7), candidates)) {
    return true
  }

  if (tokenMatchesCandidates(request.headers.get('x-cron-secret'), candidates)) {
    return true
  }

  try {
    const querySecret = new URL(request.url).searchParams.get('secret')
    if (tokenMatchesCandidates(querySecret, candidates)) return true
  } catch {
    /* ignore */
  }

  return false
}

/** @deprecated Use isExternalCronAuthorized */
export function isProcessScheduledCronAuthorized(request: NextRequest): boolean {
  return isExternalCronAuthorized(request)
}

/**
 * Authorize scheduled cron HTTP calls (legacy helper for routes that pass explicit secret).
 */
export function isCronRequestAuthorized(
  request: NextRequest,
  secret: string | undefined,
  opts?: CronAuthOptions
): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true
  const requireSecret = opts?.requireSecretForExternal ?? false
  const s = trimSecret(secret)
  if (!s) return !requireSecret
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  return auth.slice(7).trim() === s
}
