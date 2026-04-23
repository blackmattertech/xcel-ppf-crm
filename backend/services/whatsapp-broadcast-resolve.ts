/**
 * Resolve and validate broadcast payload for WhatsApp template send/schedule.
 * Used by send-template and schedule APIs so resolution logic lives in one place.
 */

import type { WhatsAppWabaConfig } from '@/backend/services/whatsapp.service'
import { listMessageTemplatesWithDetails, getTemplateBodyVariableCount } from '@/backend/services/whatsapp.service'
import { getTemplateById, getTemplateByName, getTemplateByNameAndLanguage } from '@/backend/services/whatsapp-template.service'

export interface BroadcastPayloadInput {
  templateId?: string
  templateName?: string
  templateLanguage?: string
  recipients: Array<{ phone: string; name?: string }>
  bodyParameters?: string[]
  headerParameters?: string[]
  defaultCountryCode?: string
  delayMs?: number
}

export interface ResolvedBroadcastPayload {
  templateName: string
  templateLanguage: string
  recipients: Array<{ phone: string; bodyParameters?: string[]; name?: string }>
  delayMs: number
  defaultCountryCode: string
  headerParameters?: string[]
  headerFormat?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerMediaId?: string | null
}

/** Meta's hard size limits for template media headers (bytes). */
const META_MEDIA_SIZE_LIMITS: Record<string, number> = {
  IMAGE: 5 * 1024 * 1024,      // 5 MB
  VIDEO: 16 * 1024 * 1024,     // 16 MB
  DOCUMENT: 100 * 1024 * 1024, // 100 MB
}

/**
 * HEAD-check a media URL and validate against Meta's size limits.
 * Returns an error string if too large, null if OK (or if size cannot be determined).
 */
async function checkMediaUrlSize(url: string, format: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal }).finally(() => clearTimeout(timeout))
    const contentLength = res.headers.get('content-length')
    if (!contentLength) return null // Can't determine size — let Meta decide
    const bytes = parseInt(contentLength, 10)
    if (isNaN(bytes) || bytes <= 0) return null
    const limitBytes = META_MEDIA_SIZE_LIMITS[format.toUpperCase()]
    if (!limitBytes) return null
    if (bytes > limitBytes) {
      const sizeMB = (bytes / (1024 * 1024)).toFixed(1)
      const limitMB = (limitBytes / (1024 * 1024)).toFixed(0)
      return `${format} file is ${sizeMB} MB but Meta's limit for ${format.toLowerCase()} headers is ${limitMB} MB. Compress the file and re-upload before sending.`
    }
    return null
  } catch {
    return null // Network error during check — don't block the send
  }
}

export class BroadcastValidationError extends Error {
  constructor(
    public statusCode: number,
    public body: Record<string, unknown>
  ) {
    super(typeof body.error === 'string' ? body.error : 'Validation failed')
    this.name = 'BroadcastValidationError'
  }
}

function templateNameSimilar(a: string, b: string): boolean {
  const x = a.toLowerCase().trim()
  const y = b.toLowerCase().trim()
  if (x === y) return true
  if (Math.abs(x.length - y.length) > 1) return false
  if (x.length === y.length) {
    let diff = 0
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++
    return diff <= 1
  }
  const [short, long] = x.length < y.length ? [x, y] : [y, x]
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true
  }
  return false
}

/**
 * Resolve template (DB + Meta), build body/header params, and return payload ready for sendTemplateBulk.
 * Throws BroadcastValidationError with statusCode and body for API responses.
 */
export async function resolveBroadcastPayload(
  data: BroadcastPayloadInput,
  wabaConfig: WhatsAppWabaConfig
): Promise<ResolvedBroadcastPayload> {
  let templateName: string
  let templateLanguage: string
  let dbTemplate: Awaited<ReturnType<typeof getTemplateById>> = null

  if (data.templateId) {
    const template = await getTemplateById(data.templateId)
    if (!template) {
      throw new BroadcastValidationError(404, { error: 'Template not found' })
    }
    if (template.status !== 'approved') {
      throw new BroadcastValidationError(400, {
        error: 'Only approved templates can be used for broadcast. Current status: ' + template.status,
      })
    }
    dbTemplate = template
    templateName = template.name
    templateLanguage = template.language
  } else if (data.templateName) {
    templateName = data.templateName
    const providedLang = (data.templateLanguage ?? '').trim().replace(/-/g, '_')
    if (providedLang) {
      templateLanguage = providedLang
      dbTemplate = await getTemplateByNameAndLanguage(templateName, templateLanguage)
    } else {
      const localTemplate = await getTemplateByName(templateName)
      templateLanguage = (localTemplate?.language ?? 'en').trim().replace(/-/g, '_') || 'en'
      dbTemplate = localTemplate ?? (await getTemplateByNameAndLanguage(templateName, templateLanguage))
    }
  } else {
    throw new BroadcastValidationError(400, { error: 'Provide templateId or templateName' })
  }

  const metaList = await listMessageTemplatesWithDetails(wabaConfig)
  const norm = (s: string) => (s ?? '').trim().replace(/-/g, '_').toLowerCase()
  const metaTemplate = metaList.templates?.find(
    (m) => m.name === templateName && norm(m.language ?? '') === norm(templateLanguage)
  )
  const existsInMeta = !!metaTemplate
  const approvedStatuses = ['approved', 'active']
  if (metaTemplate && !approvedStatuses.includes((metaTemplate.status ?? '').toLowerCase())) {
    throw new BroadcastValidationError(400, {
      error: `Template "${templateName}" is not approved yet. Current status: ${metaTemplate.status}.`,
      code: 'TEMPLATE_NOT_APPROVED',
      status: metaTemplate.status,
    })
  }
  if (!existsInMeta) {
    const similar = metaList.templates?.find((m) => templateNameSimilar(templateName, m.name))
    if (similar) {
      throw new BroadcastValidationError(400, {
        error: `Template "${templateName}" does not exist in Meta for language ${templateLanguage}. Did you mean "${similar.name}"?`,
        code: 'TEMPLATE_NAME_MISMATCH',
        suggestedName: similar.name,
        suggestedLanguage: similar.language,
      })
    }
    if (templateName.toLowerCase() === 'welcom') {
      throw new BroadcastValidationError(400, {
        error: 'Template name "welcom" is likely a typo. Use "welcome".',
        code: 'TEMPLATE_NAME_MISMATCH',
        suggestedName: 'welcome',
        suggestedLanguage: templateLanguage,
      })
    }
  }

  const bodyText = dbTemplate?.body_text ?? metaTemplate?.body_text ?? ''
  const expectedBodyCount = getTemplateBodyVariableCount(bodyText)
  let bodyParams = data.bodyParameters ?? []
  if (expectedBodyCount === 0) {
    bodyParams = []
  } else {
    if (bodyParams.length < expectedBodyCount) {
      const placeholders = ['Customer', 'Offer', 'Code', 'Value', 'Details']
      bodyParams = [...bodyParams]
      while (bodyParams.length < expectedBodyCount) {
        bodyParams.push(placeholders[bodyParams.length] ?? `Param${bodyParams.length + 1}`)
      }
    } else if (bodyParams.length > expectedBodyCount) {
      bodyParams = bodyParams.slice(0, expectedBodyCount)
    }
  }
  const recipients = data.recipients.map((r) => ({
    phone: r.phone,
    bodyParameters: bodyParams.length > 0 ? bodyParams : undefined,
    ...(r.name != null && String(r.name).trim() ? { name: String(r.name).trim() } : {}),
  }))

  const headerFormat = dbTemplate?.header_format ?? metaTemplate?.header_format ?? undefined
  const requestHeaderParams = data.headerParameters && data.headerParameters.length > 0 ? data.headerParameters : undefined
  const headerMediaUrl = dbTemplate?.header_media_url?.trim()
  const headerMediaId = (dbTemplate as { header_media_id?: string | null } | undefined)?.header_media_id?.trim()
  const hasUrl = headerMediaUrl && /^https?:\/\//i.test(headerMediaUrl)
  const headerParameters =
    requestHeaderParams ??
    (headerFormat && headerFormat !== 'TEXT'
      ? (hasUrl ? [headerMediaUrl!] : headerMediaId ? [headerMediaId] : undefined)
      : undefined)

  if (headerFormat && headerFormat !== 'TEXT' && (!headerParameters || headerParameters.length === 0)) {
    throw new BroadcastValidationError(400, {
      error: 'This template has an image/video/document header. Add a public URL or pass headerParameters.',
      code: 'MISSING_HEADER_MEDIA',
    })
  }

  // Validate media file size against Meta's limits before attempting the send.
  // A URL that looks like https:// in headerParameters is the actual media link being passed to Meta.
  if (headerFormat && headerFormat !== 'TEXT' && headerParameters && headerParameters.length > 0) {
    const mediaUrl = headerParameters[0]
    if (typeof mediaUrl === 'string' && /^https?:\/\//i.test(mediaUrl)) {
      const sizeError = await checkMediaUrlSize(mediaUrl, headerFormat)
      if (sizeError) {
        throw new BroadcastValidationError(400, {
          error: sizeError,
          code: 'MEDIA_TOO_LARGE',
          mediaUrl,
          format: headerFormat,
        })
      }
    }
  }

  return {
    templateName,
    templateLanguage,
    recipients,
    delayMs: Math.min(60000, Math.max(0, data.delayMs ?? 250)),
    defaultCountryCode: data.defaultCountryCode ?? '91',
    headerParameters,
    headerFormat,
    headerMediaId: headerMediaId || undefined,
  }
}
