/**
 * Import Meta Lead Ads into the CRM for a connected user.
 * Used by POST /api/integrations/facebook/leads/sync and cron /api/cron/meta-leads-sync.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { fetchAllLeadsFromMeta } from '@/backend/services/meta-leads.service'
import { createLeadsBatch } from '@/backend/services/lead.service'
import type { Database } from '@/shared/types/database'
import { invalidateCachePrefix, CACHE_KEYS } from '@/lib/cache'

type LeadInsert = Database['public']['Tables']['leads']['Insert']
type BatchFailed = Array<{ index: number; data: LeadInsert; error: string }>

export type MetaLeadsSyncJobResult =
  | {
      ok: true
      synced: number
      skipped: number
      failed: number
      message: string
      failedBatch?: BatchFailed
    }
  | { ok: false; error: string }

export async function syncMetaLeadsForUser(userId: string): Promise<MetaLeadsSyncJobResult> {
  try {
    const supabase = createServiceClient()
    const parsedLeads = await fetchAllLeadsFromMeta(userId)

    if (parsedLeads.length === 0) {
      return {
        ok: true,
        synced: 0,
        skipped: 0,
        failed: 0,
        message: 'No leads found on Meta, or no leadgen forms on the connected Page.',
      }
    }

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
      return {
        ok: true,
        synced: 0,
        skipped: parsedLeads.length,
        failed: 0,
        message: 'All fetched Meta leads already exist in the CRM.',
      }
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

    const batchResult = await createLeadsBatch(leadsData, true, userId)

    await invalidateCachePrefix(CACHE_KEYS.LEADS_LIST)
    await invalidateCachePrefix(CACHE_KEYS.ANALYTICS)
    await invalidateCachePrefix(CACHE_KEYS.DASHBOARD)

    return {
      ok: true,
      synced: batchResult.success.length,
      skipped: parsedLeads.length - toImport.length,
      failed: batchResult.failed.length,
      message: `Synced ${batchResult.success.length} new lead(s) from Meta.`,
      failedBatch: batchResult.failed.length > 0 ? batchResult.failed : undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync leads from Meta'
    return { ok: false, error: message }
  }
}
