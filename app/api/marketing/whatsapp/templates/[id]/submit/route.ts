import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getTemplateById, updateTemplateMetaStatus } from '@/backend/services/whatsapp-template.service'
import {
  createMessageTemplateAtMeta,
  getTemplateBodyVariableCount,
  uploadMediaToMeta,
  validateTemplateVariableSyntax,
  type MetaTemplateComponent,
} from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/** GET – Preview the payload that would be sent to Meta (for debugging). Does not submit. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(_request)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const template = await getTemplateById(id)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const headerFormat = (template as { header_format?: string }).header_format || 'TEXT'
  const headerMediaId = (template as { header_media_id?: string }).header_media_id?.trim()
  const headerMediaUrl = (template as { header_media_url?: string }).header_media_url?.trim()
  const hasMedia = headerFormat !== 'TEXT' && (headerMediaId || headerMediaUrl)
  const sanitizedName = template.name.replace(/\s/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '')
  const bodyVarCount = getTemplateBodyVariableCount(template.body_text)
  const buttons = (template as { buttons?: Array<{ type: string; text: string; example?: string | string[] }> }).buttons ?? []

  return NextResponse.json({
    template: {
      id: template.id,
      name: template.name,
      sanitizedName,
      language: template.language,
      category: template.category,
      header_format: headerFormat,
      header_media_id: headerMediaId ? '(present)' : null,
      header_media_url: headerMediaUrl ? '(present)' : null,
      body_text: template.body_text,
      body_var_count: bodyVarCount,
      header_text: template.header_text,
      footer_text: template.footer_text,
      buttons: buttons.map((b) => ({
        type: b.type,
        text: b.text,
        hasExample: !!(b.example && (Array.isArray(b.example) ? b.example.length : String(b.example).trim())),
      })),
    },
    wouldSubmit: template.status === 'draft' && (headerFormat === 'TEXT' || hasMedia),
    validation: {
      bodySyntax: validateTemplateVariableSyntax(template.body_text, 'Body'),
      headerSyntax: template.header_text ? validateTemplateVariableSyntax(template.header_text, 'Header') : null,
      missingMedia: headerFormat !== 'TEXT' && !headerMediaId && !headerMediaUrl,
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { id } = await params
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json(
      {
        error: 'WhatsApp Business Account not configured',
        detail: 'Link WhatsApp in Settings → Integrations, or add WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN to .env.local.',
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
  const headerMediaId = (template as { header_media_id?: string }).header_media_id?.trim()
  const headerMediaUrl = (template as { header_media_url?: string }).header_media_url?.trim()
  const isMediaUrl = headerMediaUrl && /^https?:\/\//i.test(headerMediaUrl)
  const mediaIdLooksLikeUrl = headerMediaId ? /^https?:\/\//i.test(headerMediaId) || headerMediaId.toLowerCase().startsWith('www.') : false

  if (headerFormat !== 'TEXT' && !headerMediaId && !headerMediaUrl) {
    return NextResponse.json(
      {
        error: 'Sample media is required for Image/Video/Document headers. Edit the template → upload a header image/video/document → Save → then Submit. Or change Header type to Text in the form and save.',
        reason: 'missing_header_media',
      },
      { status: 400 }
    )
  }

  const bodyVarErr = validateTemplateVariableSyntax(template.body_text, 'Body')
  if (bodyVarErr) {
    return NextResponse.json({ error: bodyVarErr, reason: 'invalid_body_syntax' }, { status: 400 })
  }
  const headerVarErr = template.header_text ? validateTemplateVariableSyntax(template.header_text, 'Header') : null
  if (headerVarErr) {
    return NextResponse.json({ error: headerVarErr, reason: 'invalid_header_syntax' }, { status: 400 })
  }

  let headerHandle: string | null = null
  let usedReuploadForHandle = false
  if (headerFormat !== 'TEXT' && (headerMediaId || headerMediaUrl)) {
    if (headerMediaId && !mediaIdLooksLikeUrl) {
      headerHandle = headerMediaId
    } else if (isMediaUrl) {
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
      usedReuploadForHandle = true
    } else {
      return NextResponse.json(
        {
          error: 'Header media is invalid. Re-upload the image/video/document in the template form, save draft, then submit again.',
          reason: 'invalid_header_media',
        },
        { status: 400 }
      )
    }
  }

  const buttons = (template as { buttons?: Array<{ type: string; text: string; example?: string | string[] }> }).buttons
  if (buttons && Array.isArray(buttons)) {
    const missingExample = buttons.find((b) => {
      if (b.type !== 'URL' && b.type !== 'PHONE_NUMBER' && b.type !== 'COPY_CODE') return false
      const ex = b.example == null ? [] : Array.isArray(b.example) ? b.example : [b.example]
      const hasExample = ex.some((e) => typeof e === 'string' && e.trim() !== '')
      return !hasExample
    })
    if (missingExample) {
      const typeLabel = missingExample.type === 'URL' ? 'URL' : missingExample.type === 'PHONE_NUMBER' ? 'Call' : 'Copy code'
      return NextResponse.json(
        {
          error: `"${missingExample.text || typeLabel}" button requires an example (e.g. ${missingExample.type === 'URL' ? 'https://example.com' : missingExample.type === 'PHONE_NUMBER' ? '+1234567890' : 'promo code'}). Edit the template and fill the example field.`,
          reason: 'missing_button_example',
        },
        { status: 400 }
      )
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
      const headerVarCount = getTemplateBodyVariableCount(template.header_text)
      const headerComp: MetaTemplateComponent = { type: 'HEADER', format: 'TEXT', text: template.header_text }
      if (headerVarCount > 0) {
        headerComp.example = {
          header_text: Array.from({ length: headerVarCount }, (_, i) => `Sample${i + 1}`),
        }
      }
      components.push(headerComp)
    }
  }
  const bodyVarCount = getTemplateBodyVariableCount(template.body_text)
  const bodyComp: MetaTemplateComponent = { type: 'BODY', text: template.body_text }
  if (bodyVarCount > 0) {
    bodyComp.example = {
      body_text: [Array.from({ length: bodyVarCount }, (_, i) => `Sample${i + 1}`)],
    }
  }
  components.push(bodyComp)
  if (template.footer_text) {
    components.push({ type: 'FOOTER', text: template.footer_text })
  }
  if (buttons && buttons.length > 0) {
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

  let result = await createMessageTemplateAtMeta(
    {
      name: template.name,
      language: template.language,
      category: template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
      components,
    },
    wabaConfig
  )

  if (!result.success && /invalid parameter|code 100/i.test(result.error ?? '') && isMediaUrl && !usedReuploadForHandle) {
    const upload = await uploadMediaToMeta(headerMediaUrl!, {
      accessToken: wabaConfig.accessToken,
      appId: process.env.FACEBOOK_APP_ID || process.env.META_APP_ID,
    })
    if (upload.success) {
      const retryComponents = components.map((c) =>
        c.type === 'HEADER' && c.example?.header_handle
          ? { ...c, example: { header_handle: [upload.handle] } }
          : c
      ) as MetaTemplateComponent[]
      result = await createMessageTemplateAtMeta(
        {
          name: template.name,
          language: template.language,
          category: template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
          components: retryComponents,
        },
        wabaConfig
      )
    }
  }

  if (!result.success) {
    let err = result.error ?? 'Failed to submit template to Meta'
    const hasSpecificMetaError = result.metaResponse && typeof result.metaResponse === 'object' && (result.metaResponse as { error?: { error_user_msg?: string } }).error?.error_user_msg
    if (!hasSpecificMetaError) {
      if (/invalid parameter|code 100/i.test(err) && headerHandle && !usedReuploadForHandle) {
        err += ' The header image may have expired. Re-upload the image in the template, save draft, then submit again.'
      }
      if (/invalid parameter|code 100/i.test(err) && headerFormat === 'TEXT') {
        err += ' Check: body uses {{1}}, {{2}} (sequential, no gaps); template name is lowercase with underscores only; button URL/phone/code has an example.'
      }
    }
    console.warn(`[WhatsApp submit] ${id}: Meta error - ${result.error}`)
    return NextResponse.json(
      {
        error: err,
        reason: 'meta_api_error',
        metaError: result.error,
        metaResponse: result.metaResponse,
        debug: { templateName: template.name, headerFormat, componentCount: components.length },
      },
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
