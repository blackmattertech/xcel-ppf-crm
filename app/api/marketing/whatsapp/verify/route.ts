import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { verifyWhatsAppIds } from '@/backend/services/whatsapp.service'

/**
 * GET – Verify WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID with Meta.
 * Use this to confirm which ID is wrong when template submit fails.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const result = await verifyWhatsAppIds()
  return NextResponse.json(result)
}
