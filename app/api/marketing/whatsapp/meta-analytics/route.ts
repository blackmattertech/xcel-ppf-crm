/**
 * Proxies Meta's official WhatsApp analytics APIs:
 *  - GET /{WABA-ID}/template_analytics  → per-template sent/delivered/read/clicked
 *  - GET /{WABA-ID}/analytics           → overall phone-level sent/delivered
 *
 * Meta docs:
 *  https://developers.facebook.com/docs/whatsapp/business-management-api/analytics
 *  https://developers.facebook.com/docs/whatsapp/business-management-api/template-analytics
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { createServiceClient } from '@/lib/supabase/service'
import { getCache, setCache, CACHE_TTL } from '@/lib/cache'

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'

// ─── types ───────────────────────────────────────────────────────────────────

interface MetaClickDetail {
  type: string
  button_content: string
  count: number
}

interface MetaDataPoint {
  template_id: string
  start: number
  end: number
  sent: number
  delivered: number
  read: number
  clicked: MetaClickDetail[]
}

interface MetaTemplateAnalyticsResponse {
  data: Array<{ granularity: string; data_points: MetaDataPoint[] }>
  paging?: { cursors?: { before?: string; after?: string } }
  error?: { message: string; code: number; fbtrace_id?: string }
}

interface MetaOverallDataPoint {
  start: number
  end: number
  sent: number
  delivered: number
}

interface MetaOverallAnalyticsResponse {
  data: Array<{ granularity: string; phone_number?: string; data_points: MetaOverallDataPoint[] }>
  error?: { message: string; code: number }
}

export interface MetaTemplateMetric {
  templateId: string
  templateName: string        // resolved from whatsapp_templates.meta_id
  sent: number
  delivered: number
  read: number
  clicked: number             // total across all buttons
  clickDetails: MetaClickDetail[]
  readRate: number            // read / sent * 100
  deliverRate: number         // delivered / sent * 100
  // CRM-supplementary (from webhook statuses stored in whatsapp_messages)
  failed: number
  notSent: number             // failed + pending — messages that never reached recipient
}

export interface MetaOverallMetrics {
  sent: number
  delivered: number
}

export interface MetaAnalyticsResponse {
  source: 'meta'
  overall: MetaOverallMetrics
  templates: MetaTemplateMetric[]
  period: { startDate: string; endDate: string }
  granularity: 'DAILY' | 'MONTHLY'
}

export interface MetaAnalyticsError {
  source: 'unavailable'
  reason: string
  period: { startDate: string; endDate: string }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000)
}

function parseTemplateName(body: string | null): string | null {
  if (!body) return null
  const m = body.match(/^\[Template:\s*(.+?)\]\s*$/i)
  return m ? m[1].trim() || null : null
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const sp = request.nextUrl.searchParams
    const startDate = sp.get('startDate') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = sp.get('endDate') ?? new Date().toISOString()
    const skipCache = sp.get('live') === '1'

    const periodPayload: MetaAnalyticsResponse['period'] = { startDate, endDate }

    // Cache key
    const cacheKey = `meta:analytics:${startDate.slice(0, 10)}:${endDate.slice(0, 10)}`
    if (!skipCache) {
      const cached = await getCache<MetaAnalyticsResponse>(cacheKey)
      if (cached) return NextResponse.json(cached)
    }

    // ── 1. Resolve WABA credentials ─────────────────────────────────────────
    const { wabaConfig } = await getResolvedWhatsAppConfig(authResult.user.id)
    if (!wabaConfig?.wabaId || !wabaConfig?.accessToken) {
      return NextResponse.json({
        source: 'unavailable',
        reason: 'WhatsApp Business Account not configured. Add WABA ID and Access Token in settings.',
        period: periodPayload,
      } satisfies MetaAnalyticsError)
    }

    const { wabaId, accessToken } = wabaConfig
    const startUnix = toUnix(startDate)
    const endUnix = toUnix(endDate)

    // Choose granularity: DAILY for ≤90 days, MONTHLY otherwise
    const daysDiff = (endUnix - startUnix) / 86400
    const granularity: 'DAILY' | 'MONTHLY' = daysDiff <= 92 ? 'DAILY' : 'MONTHLY'

    const headers = { Authorization: `Bearer ${accessToken}` }

    // ── 2. Fetch Meta template_analytics ────────────────────────────────────
    const templateAnalyticsUrl = new URL(`${META_GRAPH_BASE}/${wabaId}/template_analytics`)
    templateAnalyticsUrl.searchParams.set('start', String(startUnix))
    templateAnalyticsUrl.searchParams.set('end', String(endUnix))
    templateAnalyticsUrl.searchParams.set('granularity', granularity)
    templateAnalyticsUrl.searchParams.set('metric_types', 'SENT,DELIVERED,READ,CLICKED')

    // ── 3. Fetch Meta overall analytics ─────────────────────────────────────
    const overallAnalyticsUrl = new URL(`${META_GRAPH_BASE}/${wabaId}/analytics`)
    overallAnalyticsUrl.searchParams.set('start', String(startUnix))
    overallAnalyticsUrl.searchParams.set('end', String(endUnix))
    overallAnalyticsUrl.searchParams.set('granularity', granularity === 'DAILY' ? 'DAY' : 'MONTH')
    overallAnalyticsUrl.searchParams.set('fields', 'sent,delivered,data_points')

    const [templateRes, overallRes] = await Promise.all([
      fetch(templateAnalyticsUrl.toString(), { headers }),
      fetch(overallAnalyticsUrl.toString(), { headers }),
    ])

    const templateJson = (await templateRes.json().catch(() => ({}))) as MetaTemplateAnalyticsResponse
    const overallJson = (await overallRes.json().catch(() => ({}))) as MetaOverallAnalyticsResponse

    // Check for Meta API errors
    if (!templateRes.ok || templateJson.error) {
      const msg = templateJson.error?.message ?? `HTTP ${templateRes.status}`
      return NextResponse.json({
        source: 'unavailable',
        reason: `Meta template_analytics error: ${msg}`,
        period: periodPayload,
      } satisfies MetaAnalyticsError)
    }

    // ── 4. Aggregate template data points (sum across all days) ─────────────
    const aggregated = new Map<string, {
      sent: number; delivered: number; read: number
      clicked: number; clickDetails: Map<string, MetaClickDetail>
    }>()

    for (const block of templateJson.data ?? []) {
      for (const dp of block.data_points ?? []) {
        const tid = dp.template_id
        if (!aggregated.has(tid)) {
          aggregated.set(tid, { sent: 0, delivered: 0, read: 0, clicked: 0, clickDetails: new Map() })
        }
        const agg = aggregated.get(tid)!
        agg.sent += dp.sent ?? 0
        agg.delivered += dp.delivered ?? 0
        agg.read += dp.read ?? 0
        // Accumulate click details per button
        for (const c of dp.clicked ?? []) {
          const ck = `${c.type}:${c.button_content}`
          const existing = agg.clickDetails.get(ck)
          if (existing) existing.count += c.count
          else agg.clickDetails.set(ck, { ...c })
          agg.clicked += c.count
        }
      }
    }

    // ── 5. Aggregate overall analytics ──────────────────────────────────────
    let overallSent = 0
    let overallDelivered = 0
    for (const block of overallJson.data ?? []) {
      for (const dp of block.data_points ?? []) {
        overallSent += dp.sent ?? 0
        overallDelivered += dp.delivered ?? 0
      }
    }

    // ── 6. Resolve template IDs → names from whatsapp_templates table ───────
    const supabase = createServiceClient()
    const templateIds = Array.from(aggregated.keys())

    const idToName = new Map<string, string>()
    if (templateIds.length > 0) {
      const { data: templateRows } = await supabase
        .from('whatsapp_templates')
        .select('meta_id, name')
        .in('meta_id', templateIds)
      for (const r of (templateRows ?? []) as Array<{ meta_id: string | null; name: string }>) {
        if (r.meta_id) idToName.set(r.meta_id, r.name)
      }
    }

    // ── 7. Fetch CRM failed/notSent counts per template name ─────────────────
    // Query whatsapp_messages for failed status, group by template name in body
    const { data: failedMsgs } = await supabase
      .from('whatsapp_messages')
      .select('body, status')
      .eq('direction', 'out')
      .eq('status', 'failed')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .limit(5000)

    const failedByTemplate = new Map<string, number>()
    for (const m of (failedMsgs ?? []) as Array<{ body: string | null; status: string | null }>) {
      const name = parseTemplateName(m.body)
      if (name) failedByTemplate.set(name, (failedByTemplate.get(name) ?? 0) + 1)
    }

    // Pending (not sent) counts
    const { data: pendingMsgs } = await supabase
      .from('whatsapp_messages')
      .select('body, status')
      .eq('direction', 'out')
      .is('status', null)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .limit(2000)

    const pendingByTemplate = new Map<string, number>()
    for (const m of (pendingMsgs ?? []) as Array<{ body: string | null; status: string | null }>) {
      const name = parseTemplateName(m.body)
      if (name) pendingByTemplate.set(name, (pendingByTemplate.get(name) ?? 0) + 1)
    }

    // ── 8. Build final template list ─────────────────────────────────────────
    const templates: MetaTemplateMetric[] = Array.from(aggregated.entries()).map(([tid, agg]) => {
      const name = idToName.get(tid) ?? `Template ${tid}`
      const failed = failedByTemplate.get(name) ?? 0
      const pending = pendingByTemplate.get(name) ?? 0
      const sent = agg.sent
      return {
        templateId: tid,
        templateName: name,
        sent,
        delivered: agg.delivered,
        read: agg.read,
        clicked: agg.clicked,
        clickDetails: Array.from(agg.clickDetails.values()),
        readRate: sent > 0 ? (agg.read / sent) * 100 : 0,
        deliverRate: sent > 0 ? (agg.delivered / sent) * 100 : 0,
        failed,
        notSent: failed + pending,
      }
    }).sort((a, b) => b.sent - a.sent)

    const result: MetaAnalyticsResponse = {
      source: 'meta',
      overall: { sent: overallSent, delivered: overallDelivered },
      templates,
      period: periodPayload,
      granularity,
    }

    if (!skipCache) {
      await setCache(cacheKey, result, CACHE_TTL.SHORT)
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch Meta analytics' },
      { status: 500 }
    )
  }
}
