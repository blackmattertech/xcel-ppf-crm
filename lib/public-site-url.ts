/**
 * Canonical browser-facing origin (no trailing slash).
 * Set on production: NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL (e.g. https://ultrakool-crm.vercel.app).
 * On Vercel, VERCEL_URL is used only if those are unset (preview URLs).
 */
export function getPublicSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`
      : '')
  return raw.replace(/\/$/, '')
}
