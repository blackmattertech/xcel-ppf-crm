/** Lead field tokens for WhatsApp template / message substitution. */

export const LEAD_TEMPLATE_TOKEN_OPTIONS = [
  { value: '{{lead_name}}', label: 'Lead name' },
  { value: '{{lead_car}}', label: 'Lead car / vehicle' },
  { value: '{{name}}', label: 'Lead name (short)' },
  { value: '{{car}}', label: 'Lead car (short)' },
] as const

export type LeadTemplateTokenValue = (typeof LEAD_TEMPLATE_TOKEN_OPTIONS)[number]['value']

export function applyLeadTokens(
  text: string,
  tokens: { name: string | null; car: string | null }
): string {
  const name = tokens.name?.trim() || 'there'
  const car = tokens.car?.trim() || 'vehicle'
  return text
    .replace(/\{\{lead_name\}\}/gi, name)
    .replace(/\{\{name\}\}/gi, name)
    .replace(/\{\{lead_car\}\}/gi, car)
    .replace(/\{\{car\}\}/gi, car)
}

export function resolveTemplateParameterValues(
  paramTemplates: string[] | null | undefined,
  tokens: { name: string | null; car: string | null }
): string[] {
  if (!paramTemplates?.length) return []
  return paramTemplates.map((p) => applyLeadTokens(String(p).trim(), tokens))
}

/** Count positional Meta variables {{1}}, {{2}}, … in template text. */
export function getTemplateBodyVariableCount(bodyText: string): number {
  const matches = bodyText.match(/\{\{(\d+)\}\}/g)
  if (!matches) return 0
  const indices = new Set(matches.map((m) => parseInt(m.replace(/\{\{|\}\}/g, ''), 10)))
  return indices.size === 0 ? 0 : Math.max(...indices)
}

export type TemplateHeaderMediaFormat = 'IMAGE' | 'VIDEO' | 'DOCUMENT'

const MEDIA_HEADER_FORMATS: TemplateHeaderMediaFormat[] = ['IMAGE', 'VIDEO', 'DOCUMENT']

/** Media header format (IMAGE/VIDEO/DOCUMENT) for the template, or null for TEXT/none. */
export function getTemplateHeaderMediaFormat(template: {
  header_format?: string | null
}): TemplateHeaderMediaFormat | null {
  const fmt = (template.header_format || '').toUpperCase()
  return (MEDIA_HEADER_FORMATS as string[]).includes(fmt)
    ? (fmt as TemplateHeaderMediaFormat)
    : null
}

export interface TemplateParameterSlotCounts {
  bodyCount: number
  /** Number of header slots to fill (text vars OR 1 for a media URL). */
  headerCount: number
  /** True when the header is media (IMAGE/VIDEO/DOCUMENT) and needs a URL/media ID. */
  headerIsMedia: boolean
  headerMediaFormat: TemplateHeaderMediaFormat | null
}

export function getTemplateParameterSlotCounts(template: {
  body_text: string
  header_text?: string | null
  header_format?: string | null
}): TemplateParameterSlotCounts {
  const bodyCount = getTemplateBodyVariableCount(template.body_text || '')
  const headerMediaFormat = getTemplateHeaderMediaFormat(template)
  if (headerMediaFormat) {
    // Media header always needs exactly one parameter (URL or media ID) at send time.
    return { bodyCount, headerCount: 1, headerIsMedia: true, headerMediaFormat }
  }
  const headerCount =
    template.header_format === 'TEXT' && template.header_text?.trim()
      ? getTemplateBodyVariableCount(template.header_text)
      : 0
  return { bodyCount, headerCount, headerIsMedia: false, headerMediaFormat: null }
}

export function defaultParameterValues(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return '{{lead_name}}'
    if (i === 1) return '{{lead_car}}'
    return ''
  })
}

/**
 * Default header parameters for a template. For a media header, prefill the
 * stored media URL so the loop sends correctly without extra typing.
 */
export function defaultHeaderParameterValues(template: {
  header_text?: string | null
  header_format?: string | null
  header_media_url?: string | null
}): string[] {
  const { headerCount, headerIsMedia } = getTemplateParameterSlotCounts({
    body_text: '',
    header_text: template.header_text,
    header_format: template.header_format,
  })
  if (headerCount === 0) return []
  if (headerIsMedia) return [template.header_media_url?.trim() || '']
  return defaultParameterValues(headerCount)
}
