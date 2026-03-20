import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { checkCatalogConnected } from '@/backend/services/whatsapp-meta-template-client.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/**
 * GET - Check if WABA has a connected product catalog (for CATALOG / PRODUCT_CARD_CAROUSEL pre-submit).
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireAuth(_request)
  if ('error' in authResult) return authResult.error
  const { user } = authResult
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json(
      { connected: false, error: 'WhatsApp Business Account not configured' },
      { status: 503 }
    )
  }
  const result = await checkCatalogConnected({
    wabaId: wabaConfig.wabaId,
    accessToken: wabaConfig.accessToken,
  })
  return NextResponse.json({
    connected: result.connected,
    catalogId: result.catalogId,
    error: result.error,
  })
}
