import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getDraft } from '@/backend/services/whatsapp-template-draft.service'
import { getAuthenticationTemplatePreview } from '@/backend/services/whatsapp-meta-template-client.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import type { NormalizedTemplate } from '@/shared/whatsapp-template-types'

/**
 * GET - Fetch auth template preview from Meta (for AUTHENTICATION_OTP subtype).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error
  const { user } = authResult
  const { id } = await params
  const draft = await getDraft(id)
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  const normalized = draft.normalized_template_json as NormalizedTemplate | null
  if (!normalized || normalized.subtype !== 'AUTHENTICATION_OTP') {
    return NextResponse.json(
      { error: 'Preview is only available for AUTHENTICATION_OTP drafts' },
      { status: 400 }
    )
  }
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 503 })
  }
  const languages = normalized.languages ?? [normalized.language ?? 'en_US']
  const bodyComp = normalized.components.find((c) => c.type === 'BODY') as { addSecurityRecommendation?: boolean } | undefined
  const footerComp = normalized.components.find((c) => c.type === 'FOOTER') as { codeExpirationMinutes?: number } | undefined
  const result = await getAuthenticationTemplatePreview({
    wabaId: wabaConfig.wabaId,
    accessToken: wabaConfig.accessToken,
    languages,
    addSecurityRecommendation: bodyComp?.addSecurityRecommendation,
    codeExpirationMinutes: footerComp?.codeExpirationMinutes,
    buttonTypes: ['OTP'],
  })
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ previews: result.previews })
}
