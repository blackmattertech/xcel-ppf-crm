/**
 * Fetches leads from Meta (Facebook) Lead Ads via the Graph API.
 * Uses the same parsing as webhook payloads so lead shape is consistent.
 */

import { createServiceClient } from '@/lib/supabase/service'
import type { ParsedMetaLead } from './meta-webhook.service'
import { parseMetaLeadValue } from './meta-webhook.service'
import type { MetaLeadValue } from '@/shared/types/meta-lead'

const META_GRAPH_API_VERSION = 'v24.0'
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

export interface FacebookLeadsSettings {
  page_id: string
  access_token: string
}

export interface MetaFormNode {
  id: string
  name?: string
}

export interface MetaLeadNode {
  id: string
  created_time: string
  ad_id?: string
  adset_id?: string
  campaign_id?: string
  form_id?: string
  ad_name?: string
  adset_name?: string
  campaign_name?: string
  form_name?: string
  field_data: Array<{ name: string; values?: string[] }>
}

/**
 * Get Facebook Business settings (page_id, access_token) for the current user.
 * Leads in Meta are associated with the Page, so we need page_id to list forms.
 */
export async function getFacebookLeadsSettings(userId: string): Promise<FacebookLeadsSettings | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('facebook_business_settings')
    .select('page_id, page_access_token, access_token, expires_at')
    .eq('created_by', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null

  const row = data as {
    page_id: string | null
    page_access_token: string | null
    access_token: string
    expires_at: string | null
  }
  if (!row.page_id) return null
  // Leadgen API requires Page Access Token (#190); prefer page_access_token, fall back to access_token for older connections
  const token = row.page_access_token || row.access_token
  if (!token) return null
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null

  return {
    page_id: row.page_id,
    access_token: token,
  }
}

/**
 * Fetch all leadgen forms for the connected Facebook Page.
 * GET /{page-id}/leadgen_forms
 */
export async function fetchLeadgenForms(
  pageId: string,
  accessToken: string
): Promise<MetaFormNode[]> {
  const url = `${META_GRAPH_BASE}/${pageId}/leadgen_forms?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Meta API: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  return json.data || []
}

/**
 * Fetch leads for a single form with pagination.
 * GET /{form-id}/leads with fields for ad/campaign info.
 * Meta docs: use fields=created_time,id,ad_id,form_id,field_data and optionally campaign_id,campaign_name,adset_id,adset_name,ad_name
 */
export async function fetchLeadsForForm(
  formId: string,
  accessToken: string,
  options?: { since?: number; until?: number }
): Promise<MetaLeadNode[]> {
  const fields = [
    'created_time',
    'id',
    'ad_id',
    'adset_id',
    'campaign_id',
    'form_id',
    'ad_name',
    'adset_name',
    'campaign_name',
    'form_name',
    'field_data',
  ].join(',')

  const params = new URLSearchParams({
    access_token: accessToken,
    fields,
  })
  if (options?.since != null) params.set('filtering', JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN_OR_EQUAL', value: options.since }]))
  if (options?.until != null) {
    const filtering = options.since != null
      ? [{ field: 'time_created' as const, operator: 'GREATER_THAN_OR_EQUAL' as const, value: options.since }, { field: 'time_created' as const, operator: 'LESS_THAN' as const, value: options.until }]
      : [{ field: 'time_created' as const, operator: 'LESS_THAN' as const, value: options.until }]
    params.set('filtering', JSON.stringify(filtering))
  }

  const allLeads: MetaLeadNode[] = []
  let nextUrl: string | null = `${META_GRAPH_BASE}/${formId}/leads?${params.toString()}`

  while (nextUrl) {
    const res: Response = await fetch(nextUrl)
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(err.error?.message || `Meta API leads: ${res.status}`)
    }
    const json = await res.json() as { data?: MetaLeadNode[]; paging?: { next?: string } }
    const data = json.data || []
    allLeads.push(...data)

    const paging = json.paging
    nextUrl = paging?.next ?? null
  }

  return allLeads
}

/**
 * Convert Meta API lead node to the same shape as webhook (MetaLeadValue) so we can reuse parseMetaLeadValue.
 */
function toMetaLeadValue(node: MetaLeadNode): MetaLeadValue {
  const field_data = (node.field_data || []).map((f) => ({
    name: f.name,
    values: f.values ?? [],
  }))
  return {
    id: node.id,
    created_time: node.created_time,
    ad_id: node.ad_id ?? '',
    ad_name: node.ad_name ?? '',
    adset_id: node.adset_id ?? '',
    adset_name: node.adset_name ?? '',
    campaign_id: node.campaign_id ?? '',
    campaign_name: node.campaign_name ?? '',
    form_id: node.form_id ?? '',
    form_name: node.form_name ?? '',
    field_data,
  }
}

/**
 * Fetch all leads from Meta for the connected user's Page.
 * Lists all leadgen forms, then fetches leads for each form, and returns parsed leads (same shape as webhook).
 */
export async function fetchAllLeadsFromMeta(userId: string): Promise<ParsedMetaLead[]> {
  const settings = await getFacebookLeadsSettings(userId)
  if (!settings) {
    throw new Error('Facebook Business account not connected or token expired. Connect in Settings.')
  }

  const forms = await fetchLeadgenForms(settings.page_id, settings.access_token)
  if (forms.length === 0) {
    return []
  }

  const allParsed: ParsedMetaLead[] = []
  const seenIds = new Set<string>()

  for (const form of forms) {
    try {
      const nodes = await fetchLeadsForForm(form.id, settings.access_token)
      for (const node of nodes) {
        if (seenIds.has(node.id)) continue
        seenIds.add(node.id)
        // Log first raw lead from Meta API (exact Graph API response shape)
        if (allParsed.length === 0) {
          console.log('[Meta Leads Sync] First lead (raw from Meta Graph API):')
          console.log(JSON.stringify(node, null, 2))
        }
        const value = toMetaLeadValue(node)
        const parsed = parseMetaLeadValue(value)
        allParsed.push(parsed)
      }
    } catch (err) {
      console.error(`Error fetching leads for form ${form.id}:`, err)
      // Continue with other forms
    }
  }

  // Sort by created_time descending (newest first)
  allParsed.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
  return allParsed
}
