import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { discoverWabaFromBusinessId } from '@/backend/services/whatsapp.service'

/**
 * GET – Try to resolve the real WhatsApp Business Account ID.
 * If WHATSAPP_BUSINESS_ACCOUNT_ID is actually a Business ID, this returns the WABA ID(s) to use.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const result = await discoverWabaFromBusinessId()
  return NextResponse.json(result)
}
