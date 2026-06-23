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

/**
 * Prefer WhatsApp-specific cron secret, then shared CRON_SECRET (trimmed).
 * Use for server-to-server URLs that pass `?secret=` to internal routes.
 */
export function primaryProcessScheduledSecret(): string | undefined {
  return trimSecret(process.env.WHATSAPP_PROCESS_SCHEDULED_SECRET) ?? trimSecret(process.env.CRON_SECRET)
}

/**
 * Authorize cron HTTP calls. Production: Render Cron with Bearer CRON_SECRET (or WHATSAPP_PROCESS_SCHEDULED_SECRET).
 * Vercel `x-vercel-cron` header still accepted when present.
 */
export function isProcessScheduledCronAuthorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const token = auth.slice(7).trim()
  const candidates = [
    trimSecret(process.env.WHATSAPP_PROCESS_SCHEDULED_SECRET),
    trimSecret(process.env.CRON_SECRET),
  ].filter(Boolean) as string[]
  if (candidates.length === 0) return false
  return candidates.includes(token)
}

/**
 * Authorize scheduled cron HTTP calls.
 *
 * - Render Cron (production): `Authorization: Bearer <CRON_SECRET>`
 * - Vercel Cron: `x-vercel-cron: 1` (optional legacy)
 * - Manual curl: same Bearer header
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
