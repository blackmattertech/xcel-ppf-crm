import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getDraft, updateDraft } from '@/backend/services/whatsapp-template-draft.service'
import { buildCreationPayload } from '@/backend/services/whatsapp-template-payload-builder.service'
import { validateTemplate } from '@/backend/services/whatsapp-template-validation.service'
import { createTemplate, upsertAuthenticationTemplates } from '@/backend/services/whatsapp-meta-template-client.service'
import { checkCatalogConnected } from '@/backend/services/whatsapp-meta-template-client.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import * as repo from '@/backend/services/whatsapp-template-repository.service'
import type { NormalizedTemplate } from '@/shared/whatsapp-template-types'

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
      { error: 'WhatsApp Business Account not configured' },
      { status: 503 }
    )
  }
  const draft = await getDraft(id)
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  const normalized = draft.normalized_template_json as NormalizedTemplate | null
  if (!normalized) {
    return NextResponse.json({ error: 'Draft has no normalized template' }, { status: 400 })
  }
  const validation = validateTemplate(normalized)
  if (validation.errors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', errors: validation.errors, warnings: validation.warnings },
      { status: 400 }
    )
  }
  const subtype = normalized.subtype
  if (subtype === 'CATALOG' || subtype === 'PRODUCT_CARD_CAROUSEL') {
    const catalog = await checkCatalogConnected({ wabaId: wabaConfig.wabaId, accessToken: wabaConfig.accessToken })
    if (!catalog.connected) {
      return NextResponse.json(
        { error: 'Connect ecommerce catalog in Meta Business Manager before submitting this template' },
        { status: 400 }
      )
    }
  }
  const payload = buildCreationPayload(normalized)
  let metaId: string | null = null
  let status = 'PENDING'
  let templateRow: Record<string, unknown> | null = null

  if (subtype === 'AUTHENTICATION_OTP') {
    const result = await upsertAuthenticationTemplates({
      wabaId: wabaConfig.wabaId,
      accessToken: wabaConfig.accessToken,
      payload,
    })
    if (!result.success) {
      await updateDraft(id, { submit_state: 'failed' }, user.id)
      return NextResponse.json(
        { error: result.error ?? 'Failed to upsert auth templates', metaResponse: result.metaResponse },
        { status: 400 }
      )
    }
    const first = result.data?.[0]
    metaId = first?.id ?? null
    status = (first?.status as string) ?? 'PENDING'
  } else {
    const result = await createTemplate({
      wabaId: wabaConfig.wabaId,
      accessToken: wabaConfig.accessToken,
      payload,
    })
    if (!result.success) {
      console.error('[Template submit] Meta createTemplate failed', {
        draftId: id,
        templateName: normalized.name,
        subtype,
        metaError: result.error,
        metaResponse: result.metaResponse,
        payload,
      })
      await updateDraft(id, { submit_state: 'failed' }, user.id)
      return NextResponse.json(
        { error: result.error ?? 'Failed to create template', metaResponse: result.metaResponse },
        { status: 400 }
      )
    }
    metaId = result.id ?? null
    status = result.status ?? 'PENDING'
  }

  const mappedStatus = status.toLowerCase() === 'approved' ? 'approved' : status.toLowerCase() === 'rejected' ? 'rejected' : 'pending'
  const headerComp = normalized.components.find((c) => c.type === 'HEADER') as
    | { type: 'HEADER'; format?: string; text?: string; headerHandle?: string; headerMediaUrl?: string }
    | undefined
  const footerComp = normalized.components.find((c) => c.type === 'FOOTER') as
    | { type: 'FOOTER'; text?: string }
    | undefined
  const buttonsComp = normalized.components.find((c) => c.type === 'BUTTONS') as
    | { type: 'BUTTONS'; buttons?: Array<{ type?: string; text?: string; example?: unknown }> }
    | undefined

  const headerFormat = (headerComp?.format ?? null) as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  const headerText = headerFormat === 'TEXT' ? (headerComp?.text ?? null) : null
  const headerMediaId = headerFormat && headerFormat !== 'TEXT' ? (headerComp?.headerHandle ?? null) : null
  const headerMediaUrl = headerFormat && headerFormat !== 'TEXT' ? (headerComp?.headerMediaUrl ?? null) : null
  const normalizedButtons = (buttonsComp?.buttons ?? [])
    .map((b) => {
      const type = String(b.type || '').trim()
      const text = String(b.text || '').trim()
      if (!type || !text) return null
      const out: { type: string; text: string; example?: string } = { type, text }
      if (typeof b.example === 'string' && b.example.trim()) out.example = b.example.trim()
      return out
    })
    .filter((b): b is { type: string; text: string; example?: string } => b !== null)

  templateRow = await repo.insertTemplate({
    name: normalized.name,
    language: normalized.language ?? draft.language ?? 'en',
    category: normalized.category,
    body_text: (normalized.components.find((c) => c.type === 'BODY') as { text?: string })?.text ?? '',
    header_text: headerText,
    footer_text: footerComp?.text ?? null,
    header_format: headerFormat,
    header_media_id: headerMediaId,
    header_media_url: headerMediaUrl,
    buttons: normalizedButtons,
    status: mappedStatus,
    meta_id: metaId,
    meta_template_id: metaId,
    meta_status: status,
    template_subtype: subtype,
    components_json: draft.components_json,
    normalized_template_json: normalized,
    parameter_format: normalized.parameterFormat,
    last_sync_at: new Date().toISOString(),
    created_by: user.id,
    updated_at: new Date().toISOString(),
  })
  await updateDraft(id, { submit_state: 'submitted' }, user.id)

  return NextResponse.json({
    success: true,
    metaId,
    status,
    template: templateRow,
    message: 'Template submitted for Meta review.',
  })
}
