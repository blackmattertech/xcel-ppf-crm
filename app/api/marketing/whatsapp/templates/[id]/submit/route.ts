import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getTemplateById, updateTemplateMetaStatus } from '@/backend/services/whatsapp-template.service'
import {
  createMessageTemplateAtMeta,
  getWhatsAppWabaConfig,
  uploadMediaToMeta,
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
    const err = 'Only draft templates can be submitted'
    console.warn(`[WhatsApp submit] ${id}: ${err} (status=${template.status})`)
    return NextResponse.json(
      { error: err, reason: 'status_not_draft', currentStatus: template.status },
      { status: 400 }
    )
  }

  const headerFormat = (template as { header_format?: string }).header_format || 'TEXT'
  const headerMediaUrl = (template as { header_media_url?: string }).header_media_url?.trim()
  const isMediaUrl = headerMediaUrl && /^https?:\/\//i.test(headerMediaUrl)

  if (headerFormat !== 'TEXT' && !headerMediaUrl) {
    return NextResponse.json(
      {
        error: 'Sample media is required for Image/Video/Document headers. Add a public URL to the template (we upload it to Meta for you).',
        reason: 'missing_header_media',
      },
      { status: 400 }
    )
  }

  let headerHandle: string | null = null
  if (headerFormat !== 'TEXT' && headerMediaUrl) {
    if (isMediaUrl) {
      const upload = await uploadMediaToMeta(headerMediaUrl, {
        accessToken: wabaConfig.accessToken,
        appId: process.env.FACEBOOK_APP_ID || process.env.META_APP_ID,
      })
      if (!upload.success) {
        return NextResponse.json(
          {
            error: upload.error || 'Media upload failed',
            detail: 'Ensure FACEBOOK_APP_ID is set in .env.local and the URL is publicly accessible.',
            reason: 'media_upload_failed',
          },
          { status: 400 }
        )
      }
      headerHandle = upload.handle
    } else {
      headerHandle = headerMediaUrl
    }
  }

  const components: MetaTemplateComponent[] = []
  if (headerHandle) {
    components.push({
      type: 'HEADER',
      format: headerFormat as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
      example: { header_handle: [headerHandle] },
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
  const buttons = (template as { buttons?: Array<{ type: string; text: string; example?: string | string[] }> }).buttons
  if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((b) => {
        const needExample = b.type === 'URL' || b.type === 'PHONE_NUMBER' || b.type === 'COPY_CODE'
        const ex = b.example == null ? [] : Array.isArray(b.example) ? b.example : [b.example]
        const exampleStrings = ex.filter((e): e is string => typeof e === 'string' && e.trim() !== '')
        return {
          type: b.type as 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE',
          text: (b.text || '').trim(),
          example: needExample && exampleStrings.length > 0 ? exampleStrings : undefined,
        }
      }),
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
    let err = result.error ?? 'Failed to submit template to Meta'
    if (/invalid parameter/i.test(err)) {
      err +=
        ' Common causes: (1) Image/Video/Document header — use a Text header instead, or upload the file in Meta Business Manager. (2) Button URL/phone/code example missing or invalid. (3) Template name or language format.'
    }
    console.warn(`[WhatsApp submit] ${id}: Meta error - ${result.error}`)
    return NextResponse.json(
      { error: err, reason: 'meta_api_error' },
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
