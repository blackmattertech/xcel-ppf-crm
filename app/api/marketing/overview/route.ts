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

  const [configRes, templatesRes, analyticsRes, metaRes] = await Promise.all([
    fetch(`${origin}/api/marketing/whatsapp/config`, { headers: { cookie } }),
    fetch(`${origin}/api/marketing/whatsapp/templates`, { headers: { cookie } }),
    fetch(
      `${origin}/api/marketing/whatsapp/analytics?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      { headers: { cookie } }
    ),
    fetch(
      `${origin}/api/marketing/meta-ads-overview?date_range=${encodeURIComponent(dateRange)}`,
      { headers: { cookie } }
    ),
  ])

  const config = configRes.ok ? await configRes.json() : { configured: false }
  const templatesData = templatesRes.ok ? await templatesRes.json() : { templates: [] }
  const analytics = analyticsRes.ok ? await analyticsRes.json() : null
  const meta = metaRes.ok ? await metaRes.json() : null

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
