/**
 * Meta WhatsApp Cloud API – send text messages.
 * Requires WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in env.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

const META_GRAPH_API_VERSION = 'v24.0'
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

/**
 * Meta-supported template language display names → codes (Nov 2025).
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/supported-languages
 */
const LANGUAGE_DISPLAY_NAME_TO_CODE: Record<string, string> = {
  afrikaans: 'af',
  albanian: 'sq',
  arabic: 'ar',
  'arabic_egy': 'ar_EG',
  'arabic_uae': 'ar_AE',
  'arabic_lbn': 'ar_LB',
  'arabic_mar': 'ar_MA',
  'arabic_qat': 'ar_QA',
  azerbaijani: 'az',
  belarusian: 'be_BY',
  bengali: 'bn',
  'bengali_ind': 'bn_IN',
  bulgarian: 'bg',
  catalan: 'ca',
  'chinese_chn': 'zh_CN',
  'chinese_hkg': 'zh_HK',
  'chinese_tai': 'zh_TW',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dari: 'prs_AF',
  dutch: 'nl',
  'dutch_bel': 'nl_BE',
  english: 'en',
  'english_uk': 'en_GB',
  'english_us': 'en_US',
  'english_uae': 'en_AE',
  'english_aus': 'en_AU',
  'english_can': 'en_CA',
  'english_gha': 'en_GH',
  'english_irl': 'en_IE',
  'english_ind': 'en_IN',
  'english_jam': 'en_JM',
  'english_mys': 'en_MY',
  'english_nzl': 'en_NZ',
  'english_qat': 'en_QA',
  'english_sgp': 'en_SG',
  'english_uga': 'en_UG',
  'english_zaf': 'en_ZA',
  estonian: 'et',
  filipino: 'fil',
  finnish: 'fi',
  french: 'fr',
  'french_bel': 'fr_BE',
  'french_can': 'fr_CA',
  'french_che': 'fr_CH',
  'french_civ': 'fr_CI',
  'french_mar': 'fr_MA',
  georgian: 'ka',
  german: 'de',
  'german_aut': 'de_AT',
  'german_che': 'de_CH',
  greek: 'el',
  gujarati: 'gu',
  hausa: 'ha',
  hebrew: 'he',
  hindi: 'hi',
  hungarian: 'hu',
  indonesian: 'id',
  irish: 'ga',
  italian: 'it',
  japanese: 'ja',
  kannada: 'kn',
  kazakh: 'kk',
  kinyarwanda: 'rw_RW',
  korean: 'ko',
  'kyrgyz_kyrgyzstan': 'ky_KG',
  lao: 'lo',
  latvian: 'lv',
  lithuanian: 'lt',
  macedonian: 'mk',
  malay: 'ms',
  malayalam: 'ml',
  marathi: 'mr',
  norwegian: 'nb',
  pashto: 'ps_AF',
  persian: 'fa',
  polish: 'pl',
  'portuguese_br': 'pt_BR',
  'portuguese_por': 'pt_PT',
  punjabi: 'pa',
  romanian: 'ro',
  russian: 'ru',
  serbian: 'sr',
  sinhala: 'si_LK',
  slovak: 'sk',
  slovenian: 'sl',
  spanish: 'es',
  'spanish_arg': 'es_AR',
  'spanish_chl': 'es_CL',
  'spanish_col': 'es_CO',
  'spanish_cri': 'es_CR',
  'spanish_dom': 'es_DO',
  'spanish_ecu': 'es_EC',
  'spanish_hnd': 'es_HN',
  'spanish_mex': 'es_MX',
  'spanish_pan': 'es_PA',
  'spanish_per': 'es_PE',
  'spanish_spa': 'es_ES',
  'spanish_ury': 'es_UY',
  swahili: 'sw',
  swedish: 'sv',
  tamil: 'ta',
  telugu: 'te',
  thai: 'th',
  turkish: 'tr',
  ukrainian: 'uk',
  urdu: 'ur',
  uzbek: 'uz',
  vietnamese: 'vi',
  zulu: 'zu',
}

/**
 * Normalize Meta template language to a code Meta send API accepts (fixes #132001).
 * Meta may return a code (en_US) or a display name (English); we always output a code.
 * For SENDING, we force "en" for any English variant (en_US, en_GB, etc.) so templates
 * created as "English" in Meta always work.
 */
export function normalizeTemplateLanguageCode(value: string | { code?: string } | null | undefined): string {
  const raw = typeof value === 'string' ? value : (value && typeof value === 'object' && value.code) ? value.code : ''
  const s = (raw || 'en').replace(/-/g, '_').trim()
  if (!s) return 'en'
  const lower = s.toLowerCase()
  // Force "en" for any English variant (en, en_US, en_GB, etc.) so Meta "English" templates always work (#132001)
  if (lower === 'en' || lower.startsWith('en_')) return 'en'
  // Already a valid non-English code (e.g. hi, pt_BR): use as-is
  if (/^[a-z]{2,3}(_[a-zA-Z0-9]{2,4})?$/.test(s)) return s
  const key = lower.replace(/\s+/g, '_').replace(/[()]/g, '')
  const fromMap = LANGUAGE_DISPLAY_NAME_TO_CODE[key]
  if (fromMap && (fromMap === 'en_US' || fromMap.startsWith('en_'))) return 'en'
  return fromMap ?? s
}

export interface WhatsAppConfig {
  phoneNumberId: string
  accessToken: string
}

export interface WhatsAppWabaConfig {
  wabaId: string
  accessToken: string
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId?.trim() || !accessToken?.trim()) return null
  return { phoneNumberId: phoneNumberId.trim(), accessToken: accessToken.trim() }
}

/** WhatsApp Business Account ID – required for creating/listing message templates. */
export function getWhatsAppWabaConfig(): WhatsAppWabaConfig | null {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!wabaId?.trim() || !accessToken?.trim()) return null
  return { wabaId: wabaId.trim(), accessToken: accessToken.trim() }
}

/**
 * Verify IDs with Meta: GET each node to see if it exists and is accessible.
 * Helps distinguish "wrong WABA ID" (e.g. you used App ID or Phone Number ID) from token issues.
 */
export async function verifyWhatsAppIds(): Promise<{
  phoneNumberId: { ok: boolean; error?: string }
  wabaId: { ok: boolean; error?: string }
}> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim()

  const result = { phoneNumberId: { ok: false as boolean, error: undefined as string | undefined }, wabaId: { ok: false, error: undefined as string | undefined } }

  if (!token) {
    result.phoneNumberId.error = 'No WHATSAPP_ACCESS_TOKEN'
    result.wabaId.error = 'No WHATSAPP_ACCESS_TOKEN'
    return result
  }

  if (phoneNumberId) {
    const res = await fetch(`${META_GRAPH_BASE}/${phoneNumberId}?fields=id,display_phone_number`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({})) as { id?: string; error?: { message: string } }
    if (res.ok && data.id) result.phoneNumberId = { ok: true, error: undefined }
    else result.phoneNumberId.error = data?.error?.message ?? `HTTP ${res.status}`
  } else result.phoneNumberId.error = 'No WHATSAPP_PHONE_NUMBER_ID'

  if (wabaId) {
    const res = await fetch(`${META_GRAPH_BASE}/${wabaId}?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({})) as { id?: string; error?: { message: string } }
    if (res.ok && data.id) result.wabaId = { ok: true, error: undefined }
    else result.wabaId.error = data?.error?.message ?? `HTTP ${res.status}`
  } else result.wabaId.error = 'No WHATSAPP_BUSINESS_ACCOUNT_ID'

  return result
}

/**
 * If your WHATSAPP_BUSINESS_ACCOUNT_ID is actually a Business ID (not a WABA), Meta returns
 * "does not support this operation" for message_templates. This tries GET /{id}/client_whatsapp_business_accounts
 * to get the real WABA ID(s) under that business.
 */
export async function discoverWabaFromBusinessId(): Promise<{ wabaId?: string; wabaIds?: string[]; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const currentId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim()
  if (!token || !currentId) {
    return { error: 'WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID must be set.' }
  }
  const url = `${META_GRAPH_BASE}/${currentId}/client_whatsapp_business_accounts?fields=id,name&access_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({})) as {
    data?: Array<{ id: string; name?: string }>
    error?: { message: string }
  }
  if (!res.ok) {
    return { error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  const list = data?.data
  if (!Array.isArray(list) || list.length === 0) {
    return { error: 'No WhatsApp Business Accounts found for this ID. The ID may be an App ID or wrong account.' }
  }
  const wabaIds = list.map((w) => w.id)
  return { wabaId: wabaIds[0], wabaIds }
}

/**
 * Normalize phone to E.164 digits only (no +). If 10 digits, prepend defaultCountryCode (e.g. 91 for India).
 */
export function toE164Digits(phone: string, defaultCountryCode = '91'): string {
  const digits = phone.replace(/\D/g, '').trim()
  if (digits.length === 0) return ''
  if (digits.length <= 10 && defaultCountryCode) {
    const cc = defaultCountryCode.replace(/\D/g, '')
    if (cc.length >= 1) return `${cc}${digits}`
  }
  return digits
}

export interface SendTextResult {
  success: boolean
  messageId?: string
  error?: string
  errorCode?: number
}

/**
 * Send a single text message via WhatsApp Cloud API.
 * Phone must be E.164 digits only (e.g. 919876543210).
 */
export async function sendWhatsAppText(
  to: string,
  body: string,
  config?: WhatsAppConfig | null
): Promise<SendTextResult> {
  const cfg = config ?? getWhatsAppConfig()
  if (!cfg) {
    return { success: false, error: 'WhatsApp API not configured (missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN)' }
  }

  const digits = toE164Digits(to)
  if (digits.length < 10) {
    return { success: false, error: 'Invalid phone number' }
  }

  const url = `${META_GRAPH_BASE}/${cfg.phoneNumberId}/messages`
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digits,
    type: 'text',
    text: {
      body: body.slice(0, 4096),
      preview_url: false,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({})) as {
    messages?: Array<{ id: string }>
    error?: { message: string; code: number; error_subcode?: number }
  }

  if (!res.ok) {
    const err = data?.error
    let errorMessage = err?.message ?? `HTTP ${res.status}`
    if (err?.code === 131047 || /re-engagement|template required|24.?hour|session.*expired/i.test(errorMessage)) {
      errorMessage += ' Use an approved template for this recipient (they have not messaged you in the last 24 hours).'
    }
    return {
      success: false,
      error: errorMessage,
      errorCode: err?.code,
    }
  }

  const messageId = data?.messages?.[0]?.id
  return { success: true, messageId }
}

export interface BulkSendResult {
  sent: number
  failed: number
  results: Array<{ phone: string; success: boolean; error?: string; metaResponse?: unknown }>
}

/**
 * Send the same text to multiple recipients. Sends sequentially with a small delay to avoid rate limits.
 */
export async function sendWhatsAppBulk(
  recipients: Array<{ phone: string }>,
  message: string,
  options?: { delayMs?: number; defaultCountryCode?: string }
): Promise<BulkSendResult> {
  const config = getWhatsAppConfig()
  const delayMs = options?.delayMs ?? 300
  const defaultCountryCode = options?.defaultCountryCode ?? '91'

  const results: BulkSendResult['results'] = []
  let sent = 0
  let failed = 0

  for (const r of recipients) {
    const phone = toE164Digits(r.phone, defaultCountryCode)
    if (!phone) {
      results.push({ phone: r.phone, success: false, error: 'Invalid phone' })
      failed++
      continue
    }
    const result = await sendWhatsAppText(phone, message, config)
    results.push({
      phone: r.phone,
      success: result.success,
      error: result.error,
    })
    if (result.success) sent++
    else failed++
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return { sent, failed, results }
}

// ---------- Resumable Upload (for template media headers) ----------

/**
 * Upload a file from a URL to Meta via Resumable Upload API; returns handle for header_handle.
 * Requires FACEBOOK_APP_ID (or META_APP_ID) and WHATSAPP_ACCESS_TOKEN.
 */
export async function uploadMediaToMeta(
  mediaUrl: string,
  options: { mimeType?: string; accessToken: string; appId?: string }
): Promise<{ success: true; handle: string } | { success: false; error: string }> {
  const appId = options.appId ?? process.env.FACEBOOK_APP_ID ?? process.env.META_APP_ID
  const token = options.accessToken?.trim()
  if (!appId?.trim() || !token) {
    return { success: false, error: 'Missing FACEBOOK_APP_ID (or META_APP_ID) and WHATSAPP_ACCESS_TOKEN for media upload' }
  }

  let buffer: ArrayBuffer
  let mimeType = options.mimeType?.trim()
  try {
    const res = await fetch(mediaUrl, { method: 'GET' })
    if (!res.ok) return { success: false, error: `Failed to fetch media: ${res.status}` }
    buffer = await res.arrayBuffer()
    if (!mimeType && res.headers.get('content-type')) {
      mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || ''
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to fetch media URL' }
  }

  const fileLength = buffer.byteLength
  if (fileLength === 0) return { success: false, error: 'Media file is empty' }

  const inferredType = mediaUrl.match(/\.(jpe?g|png|gif|webp|mp4|m4v|pdf)(\?|$)/i)?.[1]?.toLowerCase()
  const typeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', m4v: 'video/x-m4v', pdf: 'application/pdf',
  }
  mimeType = mimeType || (inferredType ? typeMap[inferredType] : 'application/octet-stream')

  const createUrl = `${META_GRAPH_BASE}/${appId}/uploads`
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    },
    body: new URLSearchParams({
      file_length: String(fileLength),
      file_type: mimeType,
    }).toString(),
  })
  const createData = await createRes.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
  if (!createRes.ok || !createData.id) {
    const msg = createData?.error?.message ?? `Create session failed: ${createRes.status}`
    return { success: false, error: msg }
  }

  const sessionId = createData.id
  const uploadUrl = `${META_GRAPH_BASE}/${sessionId}`
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType }), 'file')

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const uploadData = await uploadRes.json().catch(() => ({})) as { h?: string; handle?: string; error?: { message?: string } }
  if (!uploadRes.ok) {
    const msg = uploadData?.error?.message ?? `Upload failed: ${uploadRes.status}`
    return { success: false, error: msg }
  }

  const handle = uploadData?.h ?? uploadData?.handle
  if (!handle || typeof handle !== 'string') {
    return { success: false, error: 'Meta did not return a media handle (response missing "h")' }
  }
  return { success: true, handle }
}

// ---------- Message templates (design → submit to Meta → bulk send) ----------

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?: string
  example?: { header_handle?: string[] }
  buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'; text: string; example?: string[] }>
}

export interface CreateTemplateAtMetaInput {
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  components: MetaTemplateComponent[]
}

export interface CreateTemplateAtMetaResult {
  success: boolean
  id?: string
  status?: string
  error?: string
}

/**
 * Create (and submit for review) a message template at Meta.
 * Requires WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN.
 */
export async function createMessageTemplateAtMeta(
  input: CreateTemplateAtMetaInput,
  config?: WhatsAppWabaConfig | null
): Promise<CreateTemplateAtMetaResult> {
  const cfg = config ?? getWhatsAppWabaConfig()
  if (!cfg) {
    return { success: false, error: 'WhatsApp Business Account not configured (missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN)' }
  }

  const url = `${META_GRAPH_BASE}/${cfg.wabaId}/message_templates`
  const body = {
    name: input.name.replace(/\s/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, ''),
    language: input.language.replace(/-/g, '_'),
    category: input.category,
    components: input.components.map((c) => {
      const comp: Record<string, unknown> = { type: c.type }
      if (c.format) comp.format = c.format
      if (c.text) comp.text = c.text
      if (c.example) comp.example = c.example
      if (c.buttons && c.buttons.length > 0) {
        comp.buttons = c.buttons.map((b) => {
          const btn: Record<string, unknown> = { type: b.type, text: b.text }
          if (b.example && b.example.length > 0) btn.example = b.example
          return btn
        })
      }
      return comp
    }),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({})) as {
    id?: string
    status?: string
    error?: { message: string; code?: number }
  }

  if (!res.ok) {
    const rawMessage = data?.error?.message ?? `HTTP ${res.status}`
    const isUnsupportedOrMissing =
      /does not exist|cannot be loaded due to missing permissions|does not support this operation/i.test(rawMessage)
    const hint = isUnsupportedOrMissing
      ? ' Use the WhatsApp Business Account ID (not Phone Number ID). Find it in Meta for Developers → Your App → WhatsApp → API Setup → "WhatsApp Business Account" section. The token must have whatsapp_business_management permission.'
      : ''
    return {
      success: false,
      error: rawMessage + hint,
    }
  }

  return {
    success: true,
    id: data?.id,
    status: data?.status ?? 'PENDING',
  }
}

export interface MetaTemplateInfo {
  name: string
  language: string
  status: string
  id?: string
  category?: string
}

export interface ListMessageTemplatesResult {
  templates: MetaTemplateInfo[]
  error?: string
}

/**
 * List message templates from Meta (to sync approval status).
 * On Meta API error, returns { templates: [], error: message } so callers can show the reason.
 */
export async function listMessageTemplatesFromMeta(
  config?: WhatsAppWabaConfig | null
): Promise<ListMessageTemplatesResult> {
  const cfg = config ?? getWhatsAppWabaConfig()
  if (!cfg) {
    return { templates: [], error: 'WhatsApp Business Account not configured (WHATSAPP_BUSINESS_ACCOUNT_ID or token missing).' }
  }

  const url = `${META_GRAPH_BASE}/${cfg.wabaId}/message_templates?fields=name,status,language,category&access_token=${encodeURIComponent(cfg.accessToken)}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({})) as {
    data?: Array<{
      id?: string
      name?: string
      status?: string
      language?: string | { code?: string }
      category?: string
    }>
    error?: { message: string }
  }

  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`
    return { templates: [], error: msg }
  }
  if (!Array.isArray(data?.data)) {
    return { templates: [], error: data?.error?.message ?? 'Meta returned no template list.' }
  }

  const templates = data.data.map((t) => {
    const raw = typeof t.language === 'string' ? t.language : (t.language?.code ?? '')
    const languageCode = normalizeTemplateLanguageCode(raw)
    const rawStatus = (t.status ?? '').toString().toLowerCase().replace(/\s+/g, '_')
    return {
      id: t.id,
      name: (t.name ?? '').trim(),
      language: languageCode,
      status: rawStatus,
      category: t.category,
    }
  })
  return { templates }
}

/**
 * Extract {{1}}, {{2}}, ... from template body to know how many parameters to send.
 */
export function getTemplateBodyVariableCount(bodyText: string): number {
  const matches = bodyText.match(/\{\{(\d+)\}\}/g)
  if (!matches) return 0
  const indices = new Set(matches.map((m) => parseInt(m.replace(/\{\{|\}\}/g, ''), 10)))
  return indices.size === 0 ? 0 : Math.max(...indices)
}

export interface SendTemplateResult {
  success: boolean
  messageId?: string
  error?: string
  /** Full Meta API response body when send failed (for debugging #132001 etc.) */
  metaResponse?: unknown
}

/**
 * Send a single template message. Use approved template name/language.
 * bodyParameters: array of strings for {{1}}, {{2}}, ... in order.
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  templateLanguage: string,
  options: { bodyParameters?: string[]; headerParameters?: string[]; defaultCountryCode?: string; config?: WhatsAppConfig | null }
): Promise<SendTemplateResult> {
  const cfg = options.config ?? getWhatsAppConfig()
  if (!cfg) {
    return { success: false, error: 'WhatsApp API not configured' }
  }

  const digits = toE164Digits(to, options.defaultCountryCode ?? '91')
  if (digits.length < 10) return { success: false, error: 'Invalid phone number' }

  const components: Array<{ type: string; parameters?: Array<{ type: string; text: string }> }> = []

  if (options.bodyParameters && options.bodyParameters.length > 0) {
    components.push({
      type: 'body',
      parameters: options.bodyParameters.map((text) => ({ type: 'text', text })),
    })
  }

  if (options.headerParameters && options.headerParameters.length > 0) {
    components.push({
      type: 'header',
      parameters: options.headerParameters.map((text) => ({ type: 'text', text })),
    })
  }

  const tl = (templateLanguage || 'en').trim().toLowerCase()
  const languageCode = (tl === 'en_us' || tl.startsWith('en_')) ? 'en' : normalizeTemplateLanguageCode(templateLanguage || 'en')
  const doSend = async (lang: string) => {
    const code = (lang || 'en').toLowerCase().startsWith('en_') ? 'en' : (lang || 'en')
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'template',
      template: {
        name: (templateName || '').trim(),
        language: { code },
        components: components.length > 0 ? components : undefined,
      },
    }
    console.log('[WhatsApp send template] Request to Meta:', {
      templateName: payload.template.name,
      language: code,
      to: digits,
      phoneNumberId: cfg.phoneNumberId,
    })
    const res = await fetch(`${META_GRAPH_BASE}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.accessToken}`,
      },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    console.log('[WhatsApp send template] Meta API response:', {
      status: res.status,
      ok: res.ok,
      body,
    })
    return { res, data: body as { messages?: Array<{ id: string }>; error?: { message: string; code?: number; error_data?: unknown } } }
  }

  let { res, data } = await doSend(languageCode)

  if (!res.ok && /132001|translation|does not exist/i.test(data?.error?.message ?? '')) {
    const errData = data?.error as { error_data?: { details?: string } } | undefined
    const details = typeof errData?.error_data?.details === 'string' ? errData.error_data.details : ''
    const matchLang = details.match(/does not exist in (\w+)/i)
    const failedLang = matchLang?.[1] ?? languageCode
    let alt: string | null = null
    if (failedLang === 'en_US' || failedLang === 'en') {
      alt = failedLang === 'en_US' ? 'en' : 'en_US'
    }
    if (!alt) {
      alt = languageCode === 'en' ? 'en_US' : languageCode === 'en_US' ? 'en' : null
    }
    if (alt) {
      console.log('[WhatsApp send template] Retrying with alternate language:', alt, '(failed lang from Meta:', failedLang + ')')
      const retried = await doSend(alt)
      res = retried.res
      data = retried.data
    }
  }

  if (!res.ok) {
    return {
      success: false,
      error: data?.error?.message ?? `HTTP ${res.status}`,
      metaResponse: data,
    }
  }

  return { success: true, messageId: data?.messages?.[0]?.id }
}

/**
 * Send the same template to multiple recipients. bodyParameters can be per-recipient (array of arrays) or same for all (single array).
 */
export async function sendTemplateBulk(
  recipients: Array<{ phone: string; bodyParameters?: string[] }>,
  templateName: string,
  templateLanguage: string,
  options?: { delayMs?: number; defaultCountryCode?: string }
): Promise<BulkSendResult> {
  const delayMs = options?.delayMs ?? 300
  const defaultCountryCode = options?.defaultCountryCode ?? '91'
  const results: BulkSendResult['results'] = []
  let sent = 0
  let failed = 0

  for (const r of recipients) {
    const bodyParams = r.bodyParameters ?? []
    const result = await sendTemplateMessage(
      r.phone,
      templateName,
      templateLanguage,
      { bodyParameters: bodyParams.length > 0 ? bodyParams : undefined, defaultCountryCode }
    )
    results.push({
      phone: r.phone,
      success: result.success,
      error: result.error,
      ...(result.metaResponse !== undefined && { metaResponse: result.metaResponse }),
    })
    if (result.success) sent++
    else failed++
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return { sent, failed, results }
}
