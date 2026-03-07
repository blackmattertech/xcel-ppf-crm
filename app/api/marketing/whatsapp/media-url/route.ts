import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getMediaUrlFromMeta } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/**
 * GET /api/marketing/whatsapp/media-url?id=MEDIA_ID
 * Returns a temporary URL for a Meta media ID (for template preview).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { config } = await getResolvedWhatsAppConfig(user.id)
  const id = request.nextUrl.searchParams.get('id')?.trim()
  if (!id) {
    return NextResponse.json({ error: 'Query parameter "id" (media ID) required' }, { status: 400 })
  }

  const result = await getMediaUrlFromMeta(id, config)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ url: result.url })
}
