import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { listMessageTemplatesWithDetails } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/**
 * GET – List message templates from Meta with full content (body, header, footer, buttons) for Template library tab.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured', templates: [] },
      { status: 503 }
    )
  }

  const { templates, error } = await listMessageTemplatesWithDetails(wabaConfig)
  if (error) {
    return NextResponse.json(
      { error, templates: [] },
      { status: 502 }
    )
  }

  return NextResponse.json({ templates })
}
