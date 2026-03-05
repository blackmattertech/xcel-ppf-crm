/**
 * Fetches WhatsApp config from DB (linked from frontend) with env fallback.
 */
import { createServiceClient } from '@/lib/supabase/service'
import {
  getWhatsAppConfig,
  getWhatsAppWabaConfig,
  type WhatsAppConfig,
  type WhatsAppWabaConfig,
} from './whatsapp.service'

export interface WhatsAppDbConfig {
  waba_id: string
  waba_name: string | null
  phone_number_id: string
  phone_number_display: string | null
  access_token: string
}

/**
 * Get WhatsApp config from DB for a user, or first active config, or null.
 */
export async function getWhatsAppConfigFromDb(userId?: string): Promise<WhatsAppConfig | null> {
  const supabase = createServiceClient()
  let query = supabase
    .from('whatsapp_business_settings')
    .select('phone_number_id, access_token')
    .eq('is_active', true)

  if (userId) {
    query = query.eq('created_by', userId)
  }

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null

  const row = data as { phone_number_id: string; access_token: string }
  if (!row.phone_number_id?.trim() || !row.access_token?.trim()) return null

  return {
    phoneNumberId: row.phone_number_id.trim(),
    accessToken: row.access_token.trim(),
  }
}

/**
 * Get WABA config from DB for a user, or first active config, or null.
 */
export async function getWhatsAppWabaConfigFromDb(userId?: string): Promise<WhatsAppWabaConfig | null> {
  const supabase = createServiceClient()
  let query = supabase
    .from('whatsapp_business_settings')
    .select('waba_id, access_token')
    .eq('is_active', true)

  if (userId) {
    query = query.eq('created_by', userId)
  }

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null

  const row = data as { waba_id: string; access_token: string }
  if (!row.waba_id?.trim() || !row.access_token?.trim()) return null

  return {
    wabaId: row.waba_id.trim(),
    accessToken: row.access_token.trim(),
  }
}

/**
 * Get config by WABA ID (for webhooks where payload contains entry[].id).
 */
export async function getWhatsAppConfigByWabaId(wabaId: string): Promise<WhatsAppConfig | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('whatsapp_business_settings')
    .select('phone_number_id, access_token')
    .eq('waba_id', wabaId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null

  const row = data as { phone_number_id: string; access_token: string }
  if (!row.phone_number_id?.trim() || !row.access_token?.trim()) return null

  return {
    phoneNumberId: row.phone_number_id.trim(),
    accessToken: row.access_token.trim(),
  }
}

/**
 * Resolve config: try DB first (for userId), then env fallback.
 */
export async function getResolvedWhatsAppConfig(userId?: string): Promise<{
  config: WhatsAppConfig | null
  wabaConfig: WhatsAppWabaConfig | null
}> {
  const config = (await getWhatsAppConfigFromDb(userId)) ?? getWhatsAppConfig()
  const wabaConfig = (await getWhatsAppWabaConfigFromDb(userId)) ?? getWhatsAppWabaConfig()
  return { config, wabaConfig }
}
