import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getTemplateById, updateTemplateMetaStatus } from '@/backend/services/whatsapp-template.service'
import {
  createMessageTemplateAtMeta,
  getWhatsAppWabaConfig,
  type MetaTemplateComponent,
} from '@/backend/services/whatsapp.service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const wabaConfig = getWhatsAppWabaConfig()
  if (!wabaConfig) {
    const hasToken = !!process.env.WHATSAPP_ACCESS_TOKEN?.trim()
    return NextResponse.json(
      {
        error: 'WhatsApp Business Account not configured',
        detail: hasToken
          ? 'Add WHATSAPP_BUSINESS_ACCOUNT_ID to .env.local. Find it in Meta for Developers → Your App → WhatsApp → API Setup (Business Account ID).'
          : 'Add WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN to .env.local. Find WABA ID in Meta for Developers → Your App → WhatsApp → API Setup.',
      },
      { status: 503 }
    )
  }

  const template = await getTemplateById(id)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  if (template.status !== 'draft') {
    return NextResponse.json(
      { error: 'Only draft templates can be submitted' },
      { status: 400 }
    )
  }

  const components: MetaTemplateComponent[] = []
  const headerFormat = (template as { header_format?: string }).header_format || 'TEXT'
  if (headerFormat !== 'TEXT' && (template as { header_media_url?: string }).header_media_url) {
    const mediaUrl = (template as { header_media_url: string }).header_media_url
    components.push({
      type: 'HEADER',
      format: headerFormat as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
      example: { header_handle: [mediaUrl] },
    })
  } else if (template.header_text || headerFormat === 'TEXT') {
    if (template.header_text) {
      components.push({ type: 'HEADER', format: 'TEXT', text: template.header_text })
    }
  }
  components.push({ type: 'BODY', text: template.body_text })
  if (template.footer_text) {
    components.push({ type: 'FOOTER', text: template.footer_text })
  }
  const buttons = (template as { buttons?: Array<{ type: string; text: string; example?: string }> }).buttons
  if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((b) => ({
        type: b.type as 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE',
        text: b.text,
        example: b.example ? [b.example] : undefined,
      })),
    })
  }

  const result = await createMessageTemplateAtMeta(
    {
      name: template.name,
      language: template.language,
      category: template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
      components,
    },
    wabaConfig
  )

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to submit template to Meta' },
      { status: 400 }
    )
  }

  await updateTemplateMetaStatus(id, result.id ?? null, 'pending')
  return NextResponse.json({
    success: true,
    message: 'Template submitted for Meta review. Check status in a few minutes.',
    metaId: result.id,
    status: result.status,
  })
}
