import { MetaWebhookPayload, MetaLeadValue } from '@/shared/types/meta-lead'

export interface ParsedMetaLead {
  name: string
  email: string | null
  phone: string
  campaignId: string | null
  adId: string | null
  adsetId: string | null
  formId: string | null
  formName: string | null
  adName: string | null
  campaignName: string | null
  metaData: Record<string, any>
  createdTime: string
}

export function parseMetaWebhook(payload: MetaWebhookPayload): ParsedMetaLead[] {
  const leads: ParsedMetaLead[] = []

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value
      const parsed = parseMetaLeadValue(value)
      leads.push(parsed)
    }
  }

  return leads
}

/** Exported for use by meta-leads.service when fetching leads via Graph API */
export function parseMetaLeadValue(value: MetaLeadValue): ParsedMetaLead {
  // Extract fields from field_data array
  let name = ''
  let email: string | null = null
  let phone = ''

  for (const field of value.field_data) {
    const fieldName = field.name.toLowerCase()
    const fieldValue = field.values?.[0] || ''

    if (fieldName.includes('first_name') || fieldName.includes('firstname')) {
      name = fieldValue
    } else if (fieldName.includes('last_name') || fieldName.includes('lastname')) {
      name = name ? `${name} ${fieldValue}` : fieldValue
    } else if (fieldName.includes('full_name') || fieldName.includes('fullname') || fieldName === 'name') {
      name = fieldValue
    } else if (fieldName.includes('email')) {
      email = fieldValue
    } else if (fieldName.includes('phone') || fieldName.includes('mobile') || fieldName.includes('contact')) {
      phone = fieldValue
    }
  }

  // If name is still empty, try to construct from first_name and last_name
  if (!name) {
    const firstName = value.field_data.find((f) => 
      f.name.toLowerCase().includes('first_name') || f.name.toLowerCase().includes('firstname')
    )?.values?.[0]
    const lastName = value.field_data.find((f) => 
      f.name.toLowerCase().includes('last_name') || f.name.toLowerCase().includes('lastname')
    )?.values?.[0]
    
    if (firstName || lastName) {
      name = [firstName, lastName].filter(Boolean).join(' ')
    }
  }

  // Build meta_data object
  const metaData: Record<string, any> = {
    adset_name: value.adset_name,
    meta_lead_id: value.id,
  }

  // Store all field_data for reference
  metaData.field_data = value.field_data

  return {
    name: name || 'Unknown',
    email,
    phone: phone || '',
    campaignId: value.campaign_id || null,
    adId: value.ad_id || null,
    adsetId: value.adset_id || null,
    formId: value.form_id || null,
    formName: value.form_name || null,
    adName: value.ad_name || null,
    campaignName: value.campaign_name || null,
    metaData,
    createdTime: value.created_time,
  }
}
