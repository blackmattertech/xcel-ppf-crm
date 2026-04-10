import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createHash } from 'crypto'

/**
 * GET /api/marketing/overview
 * Aggregates config, templates, analytics, and meta-ads-overview for the marketing dashboard.
 * Supports ETag caching: send If-None-Match with the last ETag to get 304 Not Modified when unchanged.
 *
 * Query: startDate, endDate (ISO), date_range (e.g. last_30d for Meta)
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get('startDate') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const endDate = searchParams.get('endDate') ?? new Date().toISOString()
  const dateRange = searchParams.get('date_range') ?? 'last_30d'

  const cookie = request.headers.get('cookie') ?? ''
  const origin = request.nextUrl.origin

  // Each internal fetch gets its own AbortController — a slow endpoint won't block the others
  function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), timeoutMs)
    return fetch(url, { headers: { cookie }, signal: ac.signal }).finally(() => clearTimeout(t))
  }

  const [configRes, templatesRes, analyticsRes, metaRes] = await Promise.allSettled([
    fetchWithTimeout(`${origin}/api/marketing/whatsapp/config`),
    fetchWithTimeout(`${origin}/api/marketing/whatsapp/templates`),
    fetchWithTimeout(`${origin}/api/marketing/whatsapp/analytics?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
    fetchWithTimeout(`${origin}/api/marketing/meta-ads-overview?date_range=${encodeURIComponent(dateRange)}`),
  ])

  const config = configRes.status === 'fulfilled' && configRes.value.ok ? await configRes.value.json() : { configured: false }
  const templatesData = templatesRes.status === 'fulfilled' && templatesRes.value.ok ? await templatesRes.value.json() : { templates: [] }
  const analytics = analyticsRes.status === 'fulfilled' && analyticsRes.value.ok ? await analyticsRes.value.json() : null
  const meta = metaRes.status === 'fulfilled' && metaRes.value.ok ? await metaRes.value.json() : null

  const payload = {
    config: { configured: !!config?.configured },
    templates: templatesData?.templates ?? [],
    analytics,
    metaAdsOverview: meta,
  }

  const bodyString = JSON.stringify(payload)
  const etag = '"' + createHash('sha256').update(bodyString).digest('hex') + '"'
  const ifNoneMatch = request.headers.get('if-none-match')?.trim()

  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  return NextResponse.json(payload, {
    headers: {
      ETag: etag,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
