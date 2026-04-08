import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLead } from '@/backend/services/lead.service'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { invalidateCachePrefix, CACHE_KEYS } from '@/lib/cache'
import { getLandingPageSettings } from '@/backend/services/landing-page.service'
import { buildLeadFromLandingFields, parseLandingFormFields } from '@/shared/types/landing-form'

const utmSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v))

const bodySchema = z.object({
  fields: z.record(z.string(), z.unknown()),
  utm_source: utmSchema,
  utm_medium: utmSchema,
  utm_campaign: utmSchema,
  utm_content: utmSchema,
  utm_term: utmSchema,
})

function mergeUtmIntoMeta(
  base: Record<string, unknown>,
  utm: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  },
  referrer: string | null
) {
  const meta = { ...base }
  if (utm.utm_source) meta.utm_source = utm.utm_source
  if (utm.utm_medium) meta.utm_medium = utm.utm_medium
  if (utm.utm_campaign) meta.utm_campaign = utm.utm_campaign
  if (utm.utm_content) meta.utm_content = utm.utm_content
  if (utm.utm_term) meta.utm_term = utm.utm_term
  if (referrer) meta.referrer = referrer
  return meta
}

/**
 * Public lead capture from the marketing landing page.
 * Field definitions come from CRM (form_fields). UTM: campaign → campaign fields, medium → ad_name, content → ad_id.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, {
    ...RATE_LIMITS.LANDING_LEAD,
    errorMessage: 'Too many submissions. Please try again shortly.',
  })
  if (limited) return limited

  try {
    const settings = await getLandingPageSettings()
    if (!settings) {
      return NextResponse.json({ error: 'Landing page is not configured' }, { status: 503 })
    }

    const fieldDefs = parseLandingFormFields(settings.form_fields)
    const json = await request.json()
    const parsed = bodySchema.parse(json)

    const built = buildLeadFromLandingFields(parsed.fields, fieldDefs)
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').split('.')[0]
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    const lead_id = `LEAD-${timestamp}-${randomSuffix}`

    const referrer = request.headers.get('referer') || request.headers.get('referrer')

    const utm = {
      utm_source: parsed.utm_source,
      utm_medium: parsed.utm_medium,
      utm_campaign: parsed.utm_campaign,
      utm_content: parsed.utm_content,
      utm_term: parsed.utm_term,
    }

    const campaignName = parsed.utm_campaign ?? null
    const campaignId = parsed.utm_campaign ?? null
    const adName = parsed.utm_medium ?? null
    const adId = parsed.utm_content ?? null

    const meta_data = mergeUtmIntoMeta(built.payload.meta_data, utm, referrer)

    const lead = await createLead(
      {
        lead_id,
        name: built.payload.name,
        phone: built.payload.phone,
        email: built.payload.email,
        source: 'landing',
        form_name: 'Public landing page',
        campaign_name: campaignName,
        campaign_id: campaignId,
        ad_name: adName,
        ad_id: adId,
        requirement: built.payload.requirement,
        timeline: built.payload.timeline,
        budget_range: built.payload.budget_range,
        interest_level: built.payload.interest_level,
        meta_data,
        status: 'new',
      } as any,
      true
    )

    await invalidateCachePrefix(CACHE_KEYS.LEADS_LIST)
    await invalidateCachePrefix(CACHE_KEYS.ANALYTICS)
    await invalidateCachePrefix(CACHE_KEYS.DASHBOARD)

    return NextResponse.json({ ok: true, leadId: (lead as { id: string }).id }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit' },
      { status: 500 }
    )
  }
}
