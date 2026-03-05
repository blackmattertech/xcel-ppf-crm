import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/**
 * GET - Check if Meta WhatsApp API is configured (DB or env) for UI.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { config } = await getResolvedWhatsAppConfig(user.id)
  return NextResponse.json({ configured: !!config })
}
