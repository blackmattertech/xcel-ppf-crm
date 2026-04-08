/** Human-readable labels for leads.source (DB values). */
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta',
  manual: 'Manual',
  form: 'Form',
  whatsapp: 'WhatsApp',
  ivr: 'IVR',
  landing: 'Landing page',
}

export function formatLeadSourceLabel(source: string | null | undefined): string {
  if (source == null || source === '') return 'Unknown'
  return LEAD_SOURCE_LABELS[source] ?? source.replace(/_/g, ' ')
}
