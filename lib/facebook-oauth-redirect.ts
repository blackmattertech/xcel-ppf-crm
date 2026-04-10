import type { NextRequest } from 'next/server'

/**
 * OAuth redirect_uri must match exactly across: Meta app settings, /connect authorize URL, and /callback token exchange.
 * Use FACEBOOK_REDIRECT_URI (full callback URL) or NEXT_PUBLIC_APP_URL when request.nextUrl.origin is wrong behind proxies.
 */
export function resolveFacebookOAuthRedirectUri(request: NextRequest): string {
  const explicit = process.env.FACEBOOK_REDIRECT_URI?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (appUrl) {
    return `${appUrl}/api/integrations/facebook/callback`
  }
  return `${request.nextUrl.origin}/api/integrations/facebook/callback`
}

export function isAllowedFacebookCallbackRedirect(urlString: string): boolean {
  try {
    const u = new URL(urlString)
    const path = (u.pathname.replace(/\/$/, '') || '/').toLowerCase()
    return path.endsWith('/api/integrations/facebook/callback')
  } catch {
    return false
  }
}
