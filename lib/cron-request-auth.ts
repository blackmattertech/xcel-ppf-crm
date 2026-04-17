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
 * Vercel Cron + GitHub Actions may use CRON_SECRET while the app also defines
 * WHATSAPP_PROCESS_SCHEDULED_SECRET. Accept Bearer if it matches any configured value (trimmed).
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
 * - Vercel Cron: sends `x-vercel-cron: 1`; when `CRON_SECRET` is set in the project, Vercel also sends
 *   `Authorization: Bearer <CRON_SECRET>` (see https://vercel.com/docs/cron-jobs/manage-cron-jobs).
 * - GitHub Actions / manual: send the same `Authorization` header.
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
