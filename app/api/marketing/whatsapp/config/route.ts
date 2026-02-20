import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getWhatsAppConfig } from '@/backend/services/whatsapp.service'

/**
 * GET - Check if Meta WhatsApp API is configured (for UI to show Send via API vs fallback).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const config = getWhatsAppConfig()
  return NextResponse.json({ configured: !!config })
}
