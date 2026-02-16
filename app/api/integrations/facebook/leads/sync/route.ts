import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchAllLeadsFromMeta } from '@/backend/services/meta-leads.service'
import { createLeadsBatch } from '@/backend/services/lead.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { invalidateCachePrefix, CACHE_KEYS } from '@/lib/cache'

/**
 * POST /api/integrations/facebook/leads/sync
 *
 * Fetches all leads from Meta (Facebook Lead Ads) via the Graph API and imports
 * new ones into the CRM. Uses the connected Facebook Business account (page).
 * Duplicates are skipped by meta_lead_id and phone.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_CREATE)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const supabase = createServiceClient()

    // Fetch all leads from Meta API
    const parsedLeads = await fetchAllLeadsFromMeta(user.id)

    if (parsedLeads.length === 0) {
      return NextResponse.json({
        message: 'No leads found on Meta, or no leadgen forms on the connected Page.',
        synced: 0,
        skipped: 0,
        failed: 0,
      })
    }

    // Get existing meta_lead_ids and phones to avoid duplicates
    const metaLeadIds = parsedLeads.map((p) => p.metaData?.meta_lead_id).filter(Boolean) as string[]
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('id, meta_data, phone')
      .eq('source', 'meta')

    const existingMetaLeadIds = new Set<string>()
    const existingPhones = new Set<string>()
    for (const row of existingLeads || []) {
      const r = row as { meta_data: { meta_lead_id?: string } | null; phone: string }
      if (r.meta_data?.meta_lead_id) existingMetaLeadIds.add(String(r.meta_data.meta_lead_id))
      if (r.phone) existingPhones.add(r.phone)
    }

    const toImport = parsedLeads.filter((p) => {
      if (p.metaData?.meta_lead_id && existingMetaLeadIds.has(String(p.metaData.meta_lead_id)))
        return false
      if (p.phone && existingPhones.has(p.phone)) return false
      if (!p.phone) return false
      return true
    })

    if (toImport.length === 0) {
      return NextResponse.json({
        message: 'All fetched Meta leads already exist in the CRM.',
        synced: 0,
        skipped: parsedLeads.length,
        failed: 0,
      })
    }

    const leadIdPrefix = `LEAD-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').split('.')[0]}`
    const leadsData = toImport.map((p, i) => {
      const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
      const lead_id = `${leadIdPrefix}-${String(i).padStart(2, '0')}-${suffix}`
      return {
        lead_id,
        name: p.name,
        phone: p.phone,
        email: p.email || null,
        source: 'meta' as const,
        campaign_id: p.campaignId || null,
        ad_id: p.adId || null,
        adset_id: p.adsetId || null,
        form_id: p.formId || null,
        form_name: p.formName || null,
        ad_name: p.adName || null,
        campaign_name: p.campaignName || null,
        meta_data: p.metaData,
        status: 'new' as const,
      }
    })

    const result = await createLeadsBatch(leadsData, true, user.id)

    await invalidateCachePrefix(CACHE_KEYS.LEADS_LIST)
    await invalidateCachePrefix(CACHE_KEYS.ANALYTICS)
    await invalidateCachePrefix(CACHE_KEYS.DASHBOARD)

    return NextResponse.json({
      message: `Synced ${result.success.length} new lead(s) from Meta.`,
      synced: result.success.length,
      skipped: parsedLeads.length - toImport.length,
      failed: result.failed.length,
      details: result.failed.length > 0 ? { failed: result.failed } : undefined,
    })
  } catch (error) {
    console.error('Meta leads sync error:', error)
    const message = error instanceof Error ? error.message : 'Failed to sync leads from Meta'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
