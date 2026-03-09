import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { createLead } from '@/backend/services/lead.service'
import { buildRequirementFromMeta } from '@/shared/utils/lead-meta'
import { safeParseJsonResponse } from '@/shared/utils/safe-parse-json'
import { MetaLeadField } from '@/shared/types/meta-lead'

interface MetaApiLead {
  id: string
  created_time: string
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  form_id?: string
  form_name?: string
  field_data: MetaLeadField[]
}

function parseMetaApiLead(lead: MetaApiLead): { name: string; email: string | null; phone: string } | null {
  let name = ''
  let email: string | null = null
  let phone = ''

  for (const field of lead.field_data || []) {
    const fieldName = field.name.toLowerCase()
    const fieldValue = field.values?.[0] || ''

    if (fieldName.includes('first_name') || fieldName.includes('firstname')) {
      name = fieldValue
    } else if (fieldName.includes('last_name') || fieldName.includes('lastname')) {
      name = name ? `${name} ${fieldValue}` : fieldValue
    } else if (fieldName.includes('full_name') || fieldName.includes('fullname') || fieldName === 'name') {
      name = fieldValue
    } else if (fieldName.includes('email')) {
      email = fieldValue
    } else if (fieldName.includes('phone') || fieldName.includes('mobile') || fieldName.includes('contact')) {
      phone = fieldValue
    }
  }

  if (!name) {
    const firstName = lead.field_data?.find((f) =>
      f.name.toLowerCase().includes('first_name') || f.name.toLowerCase().includes('firstname')
    )?.values?.[0]
    const lastName = lead.field_data?.find((f) =>
      f.name.toLowerCase().includes('last_name') || f.name.toLowerCase().includes('lastname')
    )?.values?.[0]
    if (firstName || lastName) {
      name = [firstName, lastName].filter(Boolean).join(' ')
    }
  }

  if (!phone) return null

  return {
    name: name || 'Unknown',
    email,
    phone,
  }
}

/**
 * POST /api/integrations/facebook/sync-leads
 * Fetch leads from Meta Lead Ads and create them in the CRM
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const supabase = createServiceClient()

    const { data: fbData, error: settingsError } = await supabase
      .from('facebook_business_settings')
      .select('access_token, page_id, expires_at')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .maybeSingle()
    const fbSettings = fbData as { access_token: string; page_id: string | null; expires_at: string | null } | null

    if (settingsError || !fbSettings) {
      return NextResponse.json(
        { error: 'Facebook Business account not connected. Connect your account in Settings first.' },
        { status: 404 }
      )
    }

    if (fbSettings.expires_at && new Date(fbSettings.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Facebook access token has expired. Please reconnect your account in Settings.' },
        { status: 401 }
      )
    }

    const userAccessToken = fbSettings.access_token
    let pageId = fbSettings.page_id

    // Fetch pages with Page access tokens - leadgen_forms requires a Page token, not User token
    const pagesRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`
    )
    if (!pagesRes.ok) {
      return NextResponse.json(
        { error: 'Could not fetch Facebook pages. Please reconnect your account.' },
        { status: 400 }
      )
    }
    const pagesParsed = await safeParseJsonResponse<{ data?: unknown[] }>(pagesRes)
    const pages = pagesParsed.ok && pagesParsed.data?.data ? pagesParsed.data.data : []
    if (!pages.length) {
      return NextResponse.json(
        { error: 'No Facebook pages found. Connect a page with Lead Ads.' },
        { status: 404 }
      )
    }

    // Use specified page or first page
    const targetPage = pageId ? pages.find((p: { id: string }) => p.id === pageId) : pages[0]
    if (!targetPage) {
      return NextResponse.json(
        { error: 'Selected Facebook page not found. Please reconnect your account.' },
        { status: 404 }
      )
    }
    pageId = targetPage.id
    const pageAccessToken = targetPage.access_token

    const formsRes = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/leadgen_forms?fields=id,name&access_token=${pageAccessToken}`
    )

    const formsParsed = await safeParseJsonResponse<{ data?: unknown[]; error?: { message?: string } }>(formsRes)
    if (!formsRes.ok) {
      const errMsg = formsParsed.ok && formsParsed.data?.error?.message
        ? formsParsed.data.error.message
        : 'Failed to fetch lead forms. Ensure leads_retrieval permission is granted.'
      return NextResponse.json(
        { error: errMsg },
        { status: formsRes.status }
      )
    }
    const forms = formsParsed.ok && formsParsed.data?.data ? formsParsed.data.data : []

    if (forms.length === 0) {
      return NextResponse.json({
        message: 'No lead forms found on your Facebook Page.',
        synced: 0,
        skipped: 0,
        failed: 0,
      })
    }

    const fields = 'created_time,id,ad_id,adset_id,campaign_id,form_id,field_data,ad_name,adset_name,campaign_name,form_name'
    const allLeads: MetaApiLead[] = []

    for (const form of forms) {
      let url: string | null = `https://graph.facebook.com/v18.0/${form.id}/leads?fields=${fields}&access_token=${pageAccessToken}`

      while (url) {
        const res: Response = await fetch(url)
        if (!res.ok) break
        const parsed = await safeParseJsonResponse<{ data?: MetaApiLead[]; paging?: { next?: string } }>(res)
        if (!parsed.ok) break
        const leads = parsed.data.data || []
        allLeads.push(...leads)
        url = parsed.data.paging?.next || null
      }
    }

    const toProcess = allLeads
      .map((metaLead) => {
        const parsed = parseMetaApiLead(metaLead)
        return parsed ? { metaLead, parsed } : null
      })
      .filter(Boolean) as { metaLead: MetaApiLead; parsed: { name: string; email: string | null; phone: string } }[]

    const BATCH_SIZE = 10
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let synced = 0
          let failed = 0
          const skippedCount = allLeads.length - toProcess.length

          for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
            const batch = toProcess.slice(i, i + BATCH_SIZE)
            const results = await Promise.allSettled(
              batch.map(async ({ metaLead, parsed }) => {
                const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').split('.')[0]
                const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
                const lead_id = `LEAD-${timestamp}-${randomSuffix}`
                const meta_data = {
                  meta_lead_id: metaLead.id,
                  field_data: metaLead.field_data,
                }
                const requirement = buildRequirementFromMeta(meta_data) || undefined

                return createLead(
                  {
                    lead_id,
                    name: parsed.name,
                    phone: parsed.phone,
                    email: parsed.email || null,
                    source: 'meta',
                    campaign_id: metaLead.campaign_id || null,
                    ad_id: metaLead.ad_id || null,
                    adset_id: metaLead.adset_id || null,
                    form_id: metaLead.form_id || null,
                    form_name: metaLead.form_name || null,
                    ad_name: metaLead.ad_name || null,
                    campaign_name: metaLead.campaign_name || null,
                    meta_data,
                    requirement,
                    status: 'new',
                  } as any,
                  true
                )
              })
            )

            for (const result of results) {
              if (result.status === 'fulfilled') {
                synced++
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'lead', data: result.value }) + '\n'))
              } else {
                failed++
              }
            }
          }

          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'done', synced, skipped: skippedCount, failed }) + '\n')
          )
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'Sync failed' }) + '\n'
            )
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Meta sync leads error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync leads from Meta' },
      { status: 500 }
    )
  }
}
