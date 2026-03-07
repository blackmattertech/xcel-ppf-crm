import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { upsertTemplateFromMeta, type MetaTemplateDetailInput } from '@/backend/services/whatsapp-template.service'
import { listMessageTemplatesWithDetails } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/**
 * Sync templates from Meta and store full template info in DB (name, language, body, header_format, buttons, status).
 * Use this so when sending we use DB template info (header_format, header_media_url) and avoid #132012.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured' },
      { status: 503 }
    )
  }

  const { templates: metaTemplates, error: metaError } = await listMessageTemplatesWithDetails(wabaConfig)
  if (metaError) {
    const hint = /does not exist|missing permissions|does not support/i.test(metaError)
      ? ' Use the correct WHATSAPP_BUSINESS_ACCOUNT_ID (from Business Manager → Accounts → WhatsApp Accounts) and a token with whatsapp_business_management permission.'
      : ''
    return NextResponse.json(
      {
        error: 'Unable to sync templates from Meta',
        detail: metaError + hint,
      },
      { status: 502 }
    )
  }

  let upserted = 0
  for (const meta of metaTemplates) {
    const input: MetaTemplateDetailInput = {
      id: meta.id,
      name: meta.name,
      language: meta.language,
      status: meta.status,
      category: meta.category,
      body_text: meta.body_text,
      header_format: meta.header_format,
      header_text: meta.header_text,
      footer_text: meta.footer_text,
      buttons: meta.buttons,
    }
    await upsertTemplateFromMeta(input, user.id)
    upserted++
  }

  return NextResponse.json({ success: true, upserted, metaCount: metaTemplates.length })
}
