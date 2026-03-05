/**
 * Meta WhatsApp Cloud API – send text messages, templates, manage message templates.
 * Requires WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN; for templates also WHATSAPP_BUSINESS_ACCOUNT_ID.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *
 * Marketing Messages API for WhatsApp: Meta offers a separate Marketing Messages API with extra features
 * (GIF header, TTL 12h–30d for marketing, benchmarks, recommendations, conversion metrics). Same send
 * payload; onboarding and send endpoint may differ. See:
 * @see https://developers.facebook.com/docs/whatsapp/marketing-messages-api-for-whatsapp/
 * @see https://developers.facebook.com/docs/whatsapp/marketing-messages-api-for-whatsapp/features/
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
 * Normalize Meta template language to a code Meta API accepts (#132001).
 * Meta may return a code (en, en_US) or a display name (English). We output the exact code
 * so that when sending messages we use the same language the template was created with.
 * Do NOT collapse en_US/en_GB to "en" — Meta treats them as different languages.
 */
export function normalizeTemplateLanguageCode(value: string | { code?: string } | null | undefined): string {
  const raw = typeof value === 'string' ? value : (value && typeof value === 'object' && value.code) ? value.code : ''
  const s = (raw || 'en').replace(/-/g, '_').trim()
  if (!s) return 'en'
  // Already a valid language code (en, en_US, hi, pt_BR): preserve exactly for Meta send API
  if (/^[a-z]{2,3}(_[a-zA-Z0-9]{2,4})?$/.test(s)) return s
  const lower = s.toLowerCase()
  const key = lower.replace(/\s+/g, '_').replace(/[()]/g, '')
  const fromMap = LANGUAGE_DISPLAY_NAME_TO_CODE[key]
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

/** Format digits for Meta send API: include + and country code (recommended per Sending messages doc). */
export function toMetaSendTo(digits: string): string {
  return digits.startsWith('+') ? digits : `+${digits}`
}

/**
 * Mark a message as read. Use the message.id from an incoming messages webhook.
 * Good practice to call within 30 days of receipt; also marks earlier messages in the thread as read.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-messages-as-read
 */
export async function markMessageAsRead(
  messageId: string,
  config?: WhatsAppConfig | null
): Promise<{ success: boolean; error?: string }> {
  const cfg = config ?? getWhatsAppConfig()
  if (!cfg) return { success: false, error: 'WhatsApp API not configured' }
  if (!messageId?.trim()) return { success: false, error: 'message_id required' }

  const url = `${META_GRAPH_BASE}/${cfg.phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId.trim(),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }
  if (!res.ok) return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  return { success: data?.success !== false }
}

export interface SendTextResult {
  success: boolean
  messageId?: string
  error?: string
  errorCode?: number
}

/**
 * Send a single text message via WhatsApp Cloud API.
 * Uses POST /<PHONE_NUMBER_ID>/messages; to field includes + and country code per Meta recommendation.
 * Optional contextMessageId quotes the previous message (contextual reply).
 * preview_url: true so URLs in the message can show link previews (linked pages need og:title, og:description, og:url, og:image in first 300KB).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/contextual-replies
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/link-previews
 */
export async function sendWhatsAppText(
  to: string,
  body: string,
  config?: WhatsAppConfig | null,
  contextMessageId?: string | null
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
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toMetaSendTo(digits),
    type: 'text',
    text: {
      body: body.slice(0, 4096),
      preview_url: true,
    },
  }
  if (contextMessageId?.trim()) {
    payload.context = { message_id: contextMessageId.trim() }
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
    if (err?.code === 130429) {
      errorMessage += ' Throughput exceeded (default up to 80 messages/sec). Wait and retry, or check WhatsApp Manager for your number’s throughput.'
    }
    if (/does not exist|cannot be loaded due to missing permissions|does not support this operation/i.test(errorMessage)) {
      errorMessage += ` Ensure WHATSAPP_PHONE_NUMBER_ID (or DB phone_number_id) is the Phone Number ID from Meta, not the WABA ID or App ID. Verify in Meta Business Suite → WhatsApp Manager → your number, or call GET /api/marketing/whatsapp/verify to check IDs.`
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

/**
 * Get the current throughput level for the business phone number (messages per second).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/throughput
 */
export async function getPhoneNumberThroughput(
  config?: WhatsAppConfig | null
): Promise<{ throughput?: string; error?: string }> {
  const cfg = config ?? getWhatsAppConfig()
  if (!cfg) return { error: 'WhatsApp API not configured' }
  const res = await fetch(`${META_GRAPH_BASE}/${cfg.phoneNumberId}?fields=throughput`, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  })
  const data = (await res.json().catch(() => ({}))) as { throughput?: string; error?: { message?: string } }
  if (!res.ok) return { error: data?.error?.message ?? `HTTP ${res.status}` }
  return { throughput: data?.throughput }
}

export interface BulkSendResult {
  sent: number
  failed: number
  results: Array<{ phone: string; success: boolean; error?: string; messageId?: string; metaResponse?: unknown }>
}

/**
 * Send the same text to multiple recipients. Sends sequentially with a small delay to avoid rate limits.
 */
export async function sendWhatsAppBulk(
  recipients: Array<{ phone: string }>,
  message: string,
  options?: { delayMs?: number; defaultCountryCode?: string; config?: WhatsAppConfig | null }
): Promise<BulkSendResult> {
  const config = options?.config ?? getWhatsAppConfig()
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
      ...(result.messageId && { messageId: result.messageId }),
    })
    if (result.success) sent++
    else failed++
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return { sent, failed, results }
}

// ---------- Resumable Upload (for template media headers) ----------

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/x-m4v': 'm4v',
  'application/pdf': 'pdf',
}

/**
 * Upload a buffer to Meta via Resumable Upload API; returns handle for header_handle.
 * Meta requires file_name in the session and raw binary body with file_offset: 0.
 * Requires FACEBOOK_APP_ID (or META_APP_ID) and accessToken in options.
 */
export async function uploadMediaBufferToMeta(
  buffer: ArrayBuffer,
  mimeType: string,
  options: { accessToken: string; appId?: string; fileName?: string }
): Promise<{ success: true; handle: string } | { success: false; error: string }> {
  const appId = options.appId ?? process.env.FACEBOOK_APP_ID ?? process.env.META_APP_ID
  const token = options.accessToken?.trim()
  if (!appId?.trim() || !token) {
    return { success: false, error: 'Missing FACEBOOK_APP_ID (or META_APP_ID) and WHATSAPP_ACCESS_TOKEN for media upload' }
  }

  const fileLength = buffer.byteLength
  if (fileLength === 0) return { success: false, error: 'Media file is empty' }

  const mime = (mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase() || 'application/octet-stream'
  const ext = MIME_EXT[mime] ?? 'bin'
  const fileName = (options.fileName || `file.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || `file.${ext}`

  const createUrl = `${META_GRAPH_BASE}/${appId}/uploads`
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    },
    body: new URLSearchParams({
      file_name: fileName,
      file_length: String(fileLength),
      file_type: mime,
    }).toString(),
  })
  const createData = await createRes.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
  if (!createRes.ok || !createData.id) {
    const msg = createData?.error?.message ?? `Create session failed: ${createRes.status}`
    return { success: false, error: msg }
  }

  const sessionId = createData.id
  const uploadUrl = `${META_GRAPH_BASE}/${sessionId}`
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'file_offset': '0',
    },
    body: buffer,
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

/**
 * Upload a file from a URL to Meta via Resumable Upload API; returns handle for header_handle.
 * Requires FACEBOOK_APP_ID (or META_APP_ID) and WHATSAPP_ACCESS_TOKEN.
 */
export async function uploadMediaToMeta(
  mediaUrl: string,
  options: { mimeType?: string; accessToken: string; appId?: string }
): Promise<{ success: true; handle: string } | { success: false; error: string }> {
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

  const inferredType = mediaUrl.match(/\.(jpe?g|png|gif|webp|mp4|m4v|pdf)(\?|$)/i)?.[1]?.toLowerCase()
  const typeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', m4v: 'video/x-m4v', pdf: 'application/pdf',
  }
  mimeType = mimeType || (inferredType ? typeMap[inferredType] : 'application/octet-stream')
  let fileName: string | undefined
  try {
    const pathname = new URL(mediaUrl).pathname
    const segment = pathname.split('/').filter(Boolean).pop()
    if (segment && /\.(jpe?g|png|gif|webp|mp4|m4v|pdf)$/i.test(segment)) fileName = segment
  } catch {
    // ignore
  }

  return uploadMediaBufferToMeta(buffer, mimeType ?? 'application/octet-stream', { ...options, fileName })
}

// ---------- Message templates (design → submit to Meta → bulk send) ----------

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?: string
  /** For media header: header_handle. For TEXT header/body with variables: header_text / body_text (required by Meta). */
  example?: {
    header_handle?: string[]
    header_text?: string[]
    body_text?: string[][]
  }
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
  // Align with Meta Utility templates: parameter_format positional ({{1}}, {{2}}); category/type lowercase.
  const hasBodyOrHeaderParams = input.components.some(
    (c) => c.example?.body_text || c.example?.header_text
  )
  const body: Record<string, unknown> = {
    name: input.name.replace(/\s/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, ''),
    language: input.language.replace(/-/g, '_'),
    category: input.category.toLowerCase(),
    components: input.components.map((c) => {
      const comp: Record<string, unknown> = { type: (c.type as string).toLowerCase() }
      const fmt = c.format as string | undefined
      if (fmt) comp.format = fmt.toLowerCase()
      if (c.text) comp.text = c.text
      if (c.example) comp.example = c.example
      if (c.buttons && c.buttons.length > 0) {
        comp.buttons = c.buttons.map((b) => {
          const btn: Record<string, unknown> = {
            type: (b.type === 'QUICK_REPLY' ? 'quick_reply' : b.type === 'PHONE_NUMBER' ? 'phone_number' : b.type === 'COPY_CODE' ? 'copy_code' : 'url').toLowerCase(),
            text: b.text,
          }
          if (b.example && b.example.length > 0) btn.example = b.example
          return btn
        })
      }
      return comp
    }),
  }
  if (hasBodyOrHeaderParams) body.parameter_format = 'positional'

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
    const code = data?.error?.code
    const codeStr = code != null ? ` (Meta code ${code})` : ''
    if (code === 100 || /invalid parameter/i.test(rawMessage)) {
      const debugPayload = {
        name: body.name,
        language: body.language,
        category: body.category,
        components: (body.components as Array<{ type: string; format?: string; text?: string; buttons?: unknown[] }>).map((c) => ({
          type: c.type,
          format: c.format,
          textLength: c.text?.length ?? 0,
          hasExample: !!(c as { example?: unknown }).example,
          buttonCount: Array.isArray((c as { buttons?: unknown[] }).buttons) ? (c as { buttons: unknown[] }).buttons.length : 0,
        })),
      }
      console.warn('[WhatsApp createMessageTemplateAtMeta] Invalid parameter (100) – payload summary:', JSON.stringify(debugPayload))
    }
    let hint = ''
    if (/invalid parameter/i.test(rawMessage)) {
      hint =
        ' Common causes: (1) Image/Video/Document header — use a Text header, or ensure media URL is uploaded. (2) Button URL/phone/code example missing or invalid. (3) Template name (lowercase, underscores only) or language code. (4) Body/header has invalid variable syntax (use {{1}}, {{2}}).'
    } else if (/does not exist|cannot be loaded due to missing permissions|does not support this operation/i.test(rawMessage)) {
      hint =
        ' Use the WhatsApp Business Account ID (not Phone Number ID). Find it in Meta for Developers → Your App → WhatsApp → API Setup. Token must have whatsapp_business_management permission.'
    }
    return {
      success: false,
      error: rawMessage + codeStr + hint,
    }
  }

  return {
    success: true,
    id: data?.id,
    status: data?.status ?? 'PENDING',
  }
}

// ---------- Template Library (browse pre-approved templates, create from library) ----------

export interface LibraryTemplateButton {
  type: string
  text: string
  url?: string
  phone_number?: string
}

export interface LibraryTemplate {
  id: string
  name: string
  language: string
  category: string
  topic?: string
  usecase?: string
  industry?: string[]
  header?: string
  body: string
  body_params?: string[]
  body_param_types?: string[]
  buttons?: LibraryTemplateButton[]
}

export interface GetMessageTemplateLibraryOptions {
  search?: string
  language?: string
  topic?: string
  usecase?: string
  industry?: string
}

/**
 * Browse Meta's Template Library (pre-approved utility/authentication templates).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/template-library
 */
export async function getMessageTemplateLibrary(
  options: GetMessageTemplateLibraryOptions = {},
  config?: WhatsAppWabaConfig | null
): Promise<{ templates: LibraryTemplate[]; error?: string }> {
  const cfg = config ?? getWhatsAppWabaConfig()
  if (!cfg) {
    return { templates: [], error: 'WhatsApp Business Account not configured' }
  }
  const params = new URLSearchParams()
  params.set('access_token', cfg.accessToken)
  if (options.search?.trim()) params.set('search', options.search.trim())
  if (options.language?.trim()) params.set('language', options.language.trim().replace(/-/g, '_'))
  if (options.topic?.trim()) params.set('topic', options.topic.trim())
  if (options.usecase?.trim()) params.set('usecase', options.usecase.trim())
  if (options.industry?.trim()) params.set('industry', options.industry.trim())
  const url = `${META_GRAPH_BASE}/${cfg.wabaId}/message_template_library?${params.toString()}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({})) as {
    data?: Array<Record<string, unknown>>
    error?: { message: string; code?: number }
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`
    // Meta's Template Library node does not support read operations per Graph API reference; return friendly message
    const catalogUnavailable =
      res.status === 404 ||
      res.status === 400 ||
      /unsupported|does not support|cannot perform|invalid endpoint/i.test(msg)
    return {
      templates: [],
      error: catalogUnavailable
        ? 'Template Library catalog is not available via API. Use "Open in WhatsApp Manager" below to browse and add templates.'
        : msg,
    }
  }
  const raw = Array.isArray(data?.data) ? data.data : []
  const templates: LibraryTemplate[] = raw.map((t) => ({
    id: String(t.id ?? t.name ?? ''),
    name: String(t.name ?? ''),
    language: String(t.language ?? 'en_US'),
    category: String(t.category ?? 'UTILITY'),
    topic: t.topic != null ? String(t.topic) : undefined,
    usecase: t.usecase != null ? String(t.usecase) : undefined,
    industry: Array.isArray(t.industry) ? (t.industry as string[]) : undefined,
    header: t.header != null ? String(t.header) : undefined,
    body: String(t.body ?? ''),
    body_params: Array.isArray(t.body_params) ? (t.body_params as string[]) : undefined,
    body_param_types: Array.isArray(t.body_param_types) ? (t.body_param_types as string[]) : undefined,
    buttons: Array.isArray(t.buttons)
      ? (t.buttons as Array<{ type?: string; text?: string; url?: string; phone_number?: string }>).map((b) => ({
          type: String(b.type ?? 'QUICK_REPLY'),
          text: String(b.text ?? ''),
          ...(b.url && { url: b.url }),
          ...(b.phone_number && { phone_number: b.phone_number }),
        }))
      : undefined,
  }))
  return { templates }
}

export interface CreateFromLibraryInput {
  name: string
  language: string
  library_template_name: string
  library_template_button_inputs?: string
}

/**
 * Create a template in your WABA from Meta's Template Library (pre-approved, no custom review).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/template-library
 */
export async function createMessageTemplateFromLibrary(
  input: CreateFromLibraryInput,
  config?: WhatsAppWabaConfig | null
): Promise<{ success: boolean; id?: string; status?: string; error?: string }> {
  const cfg = config ?? getWhatsAppWabaConfig()
  if (!cfg) {
    return { success: false, error: 'WhatsApp Business Account not configured' }
  }
  const name = input.name.replace(/\s/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '')
  const body: Record<string, unknown> = {
    name,
    language: input.language.replace(/-/g, '_'),
    category: 'UTILITY',
    library_template_name: input.library_template_name,
  }
  if (input.library_template_button_inputs?.trim()) {
    body.library_template_button_inputs = input.library_template_button_inputs.trim()
  }
  const url = `${META_GRAPH_BASE}/${cfg.wabaId}/message_templates`
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
    error?: { message: string }
  }
  if (!res.ok) {
    return {
      success: false,
      error: data?.error?.message ?? `HTTP ${res.status}`,
    }
  }
  return {
    success: true,
    id: data?.id,
    status: data?.status ?? 'APPROVED',
  }
}

/**
 * Delete a message template from Meta by its template (HSM) id.
 * Requires WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN.
 */
export async function deleteMessageTemplateOnMeta(
  hsmId: string,
  config?: WhatsAppWabaConfig | null
): Promise<{ success: boolean; error?: string }> {
  const cfg = config ?? getWhatsAppWabaConfig()
  if (!cfg) {
    return { success: false, error: 'WhatsApp Business Account not configured' }
  }
  const url = `${META_GRAPH_BASE}/${cfg.wabaId}/message_templates?hsm_id=${encodeURIComponent(hsmId)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }
  if (!res.ok) {
    return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  return { success: data?.success !== false }
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

interface MetaTemplateComponentRaw {
  type?: string
  format?: string
  text?: string
  example?: Record<string, unknown>
  buttons?: Array<{ type?: string; text?: string; url?: string; example?: unknown }>
}

export interface MetaTemplateWithDetails {
  id: string
  name: string
  language: string
  status: string
  category: string
  body_text: string
  header_format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  header_text: string | null
  footer_text: string | null
  buttons: Array<{ type: string; text: string; example?: string }>
}

/**
 * List message templates from Meta with full content (body, header, footer, buttons) for library/preview.
 */
export async function listMessageTemplatesWithDetails(
  config?: WhatsAppWabaConfig | null
): Promise<{ templates: MetaTemplateWithDetails[]; error?: string }> {
  const cfg = config ?? getWhatsAppWabaConfig()
  if (!cfg) {
    return { templates: [], error: 'WhatsApp Business Account not configured.' }
  }

  const fields = 'id,name,status,language,category,components'
  const url = `${META_GRAPH_BASE}/${cfg.wabaId}/message_templates?fields=${fields}&access_token=${encodeURIComponent(cfg.accessToken)}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({})) as {
    data?: Array<{
      id?: string
      name?: string
      status?: string
      language?: string | { code?: string }
      category?: string
      components?: MetaTemplateComponentRaw[]
    }>
    error?: { message: string }
  }

  if (!res.ok) {
    return { templates: [], error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  if (!Array.isArray(data?.data)) {
    return { templates: [], error: data?.error?.message ?? 'Meta returned no template list.' }
  }

  const templates: MetaTemplateWithDetails[] = data.data.map((t) => {
    const rawLang = typeof t.language === 'string' ? t.language : (t.language?.code ?? '')
    const language = normalizeTemplateLanguageCode(rawLang || 'en')
    const comps = t.components ?? []
    let body_text = ''
    let header_format: MetaTemplateWithDetails['header_format'] = null
    let header_text: string | null = null
    let footer_text: string | null = null
    const buttons: MetaTemplateWithDetails['buttons'] = []

    for (const c of comps) {
      if (c.type === 'BODY' && c.text) body_text = c.text
      if (c.type === 'HEADER') {
        header_format = (c.format as MetaTemplateWithDetails['header_format']) ?? 'TEXT'
        if (header_format === 'TEXT' && c.text) header_text = c.text
      }
      if (c.type === 'FOOTER' && c.text) footer_text = c.text
      if (c.type === 'BUTTONS' && Array.isArray(c.buttons)) {
        for (const b of c.buttons) {
          const ex = b.example
          buttons.push({
            type: b.type ?? 'QUICK_REPLY',
            text: b.text ?? '',
            example: Array.isArray(ex) ? ex[0] : typeof ex === 'string' ? ex : undefined,
          })
        }
      }
    }

    return {
      id: (t.id ?? '').toString(),
      name: (t.name ?? '').trim(),
      language,
      status: (t.status ?? '').toString().toLowerCase().replace(/\s+/g, '_'),
      category: (t.category ?? '').toString(),
      body_text,
      header_format,
      header_text,
      footer_text,
      buttons,
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
 * bodyParameters: array of strings for {{1}}, {{2}}, ... in order (positional format per Meta Utility templates).
 * @see https://developers.facebook.com/docs/whatsapp/utility-templates#send-a-utility-template
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

  const code = normalizeTemplateLanguageCode(templateLanguage || 'en')
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toMetaSendTo(digits),
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
  const data = await res.json().catch(() => ({})) as { messages?: Array<{ id: string }>; error?: { message: string; code?: number; error_data?: unknown } }
  const messageId = data?.messages?.[0]?.id
  console.log('[WhatsApp send template] Meta API response:', {
    status: res.status,
    ok: res.ok,
    messageId: messageId ?? '(none)',
  })
  console.log('[WhatsApp send template] Meta API full response body:', JSON.stringify(data, null, 2))

  if (!res.ok) {
    let errMsg = data?.error?.message ?? `HTTP ${res.status}`
    if (data?.error?.code === 130429) {
      errMsg += ' Throughput exceeded. Wait and retry, or check WhatsApp Manager for your number’s throughput.'
    }
    if (/does not exist|cannot be loaded due to missing permissions|does not support this operation/i.test(errMsg)) {
      errMsg += ' Ensure WHATSAPP_PHONE_NUMBER_ID (or DB phone_number_id) is the Phone Number ID from Meta, not the WABA ID or App ID. Verify in Meta Business Suite → WhatsApp Manager, or GET /api/marketing/whatsapp/verify.'
    }
    return {
      success: false,
      error: errMsg,
      metaResponse: data,
    }
  }

  return { success: true, messageId: messageId ?? undefined }
}

/**
 * Send the same template to multiple recipients. bodyParameters can be per-recipient (array of arrays) or same for all (single array).
 * headerParameters optional, applied to all recipients (for templates with TEXT header variables).
 */
export async function sendTemplateBulk(
  recipients: Array<{ phone: string; bodyParameters?: string[] }>,
  templateName: string,
  templateLanguage: string,
  options?: { delayMs?: number; defaultCountryCode?: string; headerParameters?: string[]; config?: WhatsAppConfig | null }
): Promise<BulkSendResult> {
  const delayMs = options?.delayMs ?? 300
  const defaultCountryCode = options?.defaultCountryCode ?? '91'
  const headerParams = options?.headerParameters
  const results: BulkSendResult['results'] = []
  let sent = 0
  let failed = 0

  for (const r of recipients) {
    const bodyParams = r.bodyParameters ?? []
    const result = await sendTemplateMessage(
      r.phone,
      templateName,
      templateLanguage,
      {
        bodyParameters: bodyParams.length > 0 ? bodyParams : undefined,
        headerParameters: headerParams && headerParams.length > 0 ? headerParams : undefined,
        defaultCountryCode,
        config: options?.config ?? undefined,
      }
    )
    results.push({
      phone: r.phone,
      success: result.success,
      error: result.error,
      ...(result.messageId && { messageId: result.messageId }),
      ...(result.metaResponse !== undefined && { metaResponse: result.metaResponse }),
    })
    if (result.success) sent++
    else failed++
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return { sent, failed, results }
}
