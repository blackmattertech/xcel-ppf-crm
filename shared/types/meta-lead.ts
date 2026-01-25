export interface MetaLeadField {
  name: string
  values: string[]
}

export interface MetaLeadValue {
  id: string
  created_time: string
  ad_id: string
  ad_name: string
  adset_id: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  form_id: string
  form_name: string
  field_data: MetaLeadField[]
}

export interface MetaWebhookEntry {
  changes: Array<{
    value: MetaLeadValue
  }>
}

export interface MetaWebhookPayload {
  entry: MetaWebhookEntry[]
}
