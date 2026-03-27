import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET - Check if Meta WhatsApp API is configured (DB or env) for UI.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { config } = await getResolvedWhatsAppConfig(user.id)
  let profile: {
    waba_name: string | null
    phone_number_display: string | null
    phone_number_id: string | null
  } | null = null
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('whatsapp_business_settings')
      .select('waba_name, phone_number_display, phone_number_id')
      .eq('is_active', true)
      .eq('created_by', user.id)
      .maybeSingle()
    if (data) {
      profile = {
        waba_name: (data as { waba_name?: string | null }).waba_name ?? null,
        phone_number_display: (data as { phone_number_display?: string | null }).phone_number_display ?? null,
        phone_number_id: (data as { phone_number_id?: string | null }).phone_number_id ?? null,
      }
    }
  } catch {
    // Non-fatal: keep lightweight configured response working.
  }
  return NextResponse.json({ configured: !!config, profile })
}
