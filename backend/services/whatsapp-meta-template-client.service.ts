/**
 * Meta WhatsApp Business API client for template operations.
 * POST /message_templates, POST /upsert_message_templates, GET template, list, preview, catalog check.
 */

const META_GRAPH_API_VERSION = 'v25.0'
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

export interface WabaConfig {
  wabaId: string
  accessToken: string
}

export interface CreateTemplateParams {
  wabaId: string
  accessToken: string
  payload: Record<string, unknown>
}

export interface CreateTemplateResult {
  success: boolean
  id?: string
  status?: string
  error?: string
  metaResponse?: unknown
}

/** POST /<WABA_ID>/message_templates */
export async function createTemplate(params: CreateTemplateParams): Promise<CreateTemplateResult> {
  const { wabaId, accessToken, payload } = params
  const url = `${META_GRAPH_BASE}/${wabaId}/message_templates`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as {
    id?: string
    status?: string
    error?: { message: string; code?: number; error_user_title?: string; error_user_msg?: string }
  }
  if (!res.ok) {
    const err = data?.error
    const userTitle = err?.error_user_title?.trim()
    const userMsg = err?.error_user_msg?.trim()
    const enriched = [err?.message ?? `HTTP ${res.status}`, userTitle, userMsg].filter(Boolean).join(' - ')
    return {
      success: false,
      error: enriched,
      metaResponse: data,
    }
  }
  return {
    success: true,
    id: data?.id,
    status: data?.status ?? 'PENDING',
  }
}

export interface UpsertAuthTemplatesParams {
  wabaId: string
  accessToken: string
  payload: Record<string, unknown>
}

export interface UpsertAuthTemplatesResult {
  success: boolean
  data?: Array<{ id: string; status?: string; [k: string]: unknown }>
  error?: string
  metaResponse?: unknown
}

/** POST /<WABA_ID>/upsert_message_templates (authentication templates) */
export async function upsertAuthenticationTemplates(
  params: UpsertAuthTemplatesParams
): Promise<UpsertAuthTemplatesResult> {
  const { wabaId, accessToken, payload } = params
  const url = `${META_GRAPH_BASE}/${wabaId}/upsert_message_templates`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{ id: string; status?: string }>
    error?: { message: string }
  }
  if (!res.ok) {
    return {
      success: false,
      error: data?.error?.message ?? `HTTP ${res.status}`,
      metaResponse: data,
    }
  }
  return {
    success: true,
    data: data?.data,
    metaResponse: data,
  }
}

export interface GetTemplateByIdParams {
  templateId: string
  accessToken: string
  fields?: string
}

/** GET /<template_id> (template node) */
export async function getTemplateById(
  params: GetTemplateByIdParams
): Promise<{ success: boolean; template?: Record<string, unknown>; error?: string }> {
  const { templateId, accessToken, fields = 'id,name,status,language,category,components' } = params
  const url = `${META_GRAPH_BASE}/${templateId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message: string } }
  if (!res.ok) {
    return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  return { success: true, template: data }
}

export interface ListTemplatesParams {
  wabaId: string
  accessToken: string
  fields?: string
  afterCursor?: string
}

/** GET /<WABA_ID>/message_templates */
export async function listTemplates(
  params: ListTemplatesParams
): Promise<{ success: boolean; templates?: unknown[]; nextCursor?: string; error?: string }> {
  const { wabaId, accessToken, fields = 'id,name,status,language,category,correct_category', afterCursor } = params
  let url = `${META_GRAPH_BASE}/${wabaId}/message_templates?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`
  if (afterCursor) url += `&after=${encodeURIComponent(afterCursor)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as {
    data?: unknown[]
    paging?: { cursors?: { after?: string } }
    error?: { message: string }
  }
  if (!res.ok) {
    return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  return {
    success: true,
    templates: data?.data ?? [],
    nextCursor: data?.paging?.cursors?.after,
  }
}

export interface GetAuthenticationPreviewParams {
  wabaId: string
  accessToken: string
  languages: string[]
  addSecurityRecommendation?: boolean
  codeExpirationMinutes?: number
  buttonTypes?: string[]
}

/** GET /<WABA_ID>/message_template_previews */
export async function getAuthenticationTemplatePreview(
  params: GetAuthenticationPreviewParams
): Promise<{ success: boolean; previews?: unknown[]; error?: string }> {
  const {
    wabaId,
    accessToken,
    languages,
    addSecurityRecommendation,
    codeExpirationMinutes,
    buttonTypes = ['OTP'],
  } = params
  const q = new URLSearchParams()
  q.set('access_token', accessToken)
  languages.forEach((l) => q.append('languages', l.replace(/-/g, '_')))
  if (addSecurityRecommendation != null) q.set('add_security_recommendation', String(addSecurityRecommendation))
  if (codeExpirationMinutes != null) q.set('code_expiration_minutes', String(codeExpirationMinutes))
  buttonTypes.forEach((b) => q.append('button_types', b))
  const url = `${META_GRAPH_BASE}/${wabaId}/message_template_previews?${q.toString()}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as { data?: unknown[]; error?: { message: string } }
  if (!res.ok) {
    return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  return { success: true, previews: data?.data ?? [] }
}

export interface CheckCatalogConnectedParams {
  wabaId: string
  accessToken: string
}

/** Check if WABA has a connected product catalog (for CATALOG / PRODUCT_CARD_CAROUSEL). */
export async function checkCatalogConnected(
  params: CheckCatalogConnectedParams
): Promise<{ connected: boolean; catalogId?: string; error?: string }> {
  const { wabaId, accessToken } = params
  const url = `${META_GRAPH_BASE}/${wabaId}?fields=product_catalog&access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as {
    product_catalog?: { id?: string }
    error?: { message: string }
  }
  if (!res.ok) {
    return { connected: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  const catalog = data?.product_catalog
  return {
    connected: !!catalog?.id,
    catalogId: catalog?.id,
  }
}
