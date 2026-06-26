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

export function getTemplateParameterSlotCounts(template: {
  body_text: string
  header_text?: string | null
  header_format?: string | null
}): { bodyCount: number; headerCount: number } {
  const bodyCount = getTemplateBodyVariableCount(template.body_text || '')
  const headerCount =
    template.header_format === 'TEXT' && template.header_text?.trim()
      ? getTemplateBodyVariableCount(template.header_text)
      : 0
  return { bodyCount, headerCount }
}

export function defaultParameterValues(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return '{{lead_name}}'
    if (i === 1) return '{{lead_car}}'
    return ''
  })
}
