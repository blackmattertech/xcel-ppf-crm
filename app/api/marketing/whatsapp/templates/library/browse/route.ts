import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getMessageTemplateLibrary, getWhatsAppWabaConfig } from '@/backend/services/whatsapp.service'

/**
 * GET – Browse Meta's Template Library (pre-approved utility/authentication templates).
 * Query params: search, language, topic, usecase, industry
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/template-library
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const wabaConfig = getWhatsAppWabaConfig()
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured', templates: [] },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const options = {
    search: searchParams.get('search') ?? undefined,
    language: searchParams.get('language') ?? undefined,
    topic: searchParams.get('topic') ?? undefined,
    usecase: searchParams.get('usecase') ?? undefined,
    industry: searchParams.get('industry') ?? undefined,
  }

  const { templates, error } = await getMessageTemplateLibrary(options, wabaConfig)
  // Return 200 with empty templates when catalog is not available via API (Meta doesn't support read on this endpoint)
  if (error && templates.length === 0) {
    const isCatalogUnavailable = /not available via API|Open in WhatsApp Manager/i.test(error)
    return NextResponse.json(
      { error, templates: [] },
      { status: isCatalogUnavailable ? 200 : 502 }
    )
  }

  return NextResponse.json({ templates })
}
