import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createDraft, listDrafts } from '@/backend/services/whatsapp-template-draft.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { z } from 'zod'

const createSchema = z.object({
  wabaId: z.string().optional().nullable(),
  category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
  templateSubtype: z.enum([
    'STANDARD',
    'AUTHENTICATION_OTP',
    'CALL_PERMISSION_REQUEST',
    'CATALOG',
    'LIMITED_TIME_OFFER',
    'PRODUCT_CARD_CAROUSEL',
  ]),
  name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/),
  language: z.string().max(10).optional().nullable(),
  languages: z.array(z.string().max(10)).optional().nullable(),
  parameterFormat: z.enum(['named', 'positional']).optional().nullable(),
  components: z.unknown().optional(),
  normalizedTemplate: z.unknown().optional(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error
  const { user } = authResult
  const submitState = request.nextUrl.searchParams.get('submit_state') ?? undefined
  try {
    const drafts = await listDrafts({ createdBy: user.id, submitState })
    return NextResponse.json({ drafts })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list drafts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error
  const { user } = authResult
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  const wabaId = parsed.data.wabaId ?? wabaConfig?.wabaId ?? null
  try {
    const draft = await createDraft(
      {
        wabaId,
        category: parsed.data.category,
        templateSubtype: parsed.data.templateSubtype,
        name: parsed.data.name,
        language: parsed.data.language ?? undefined,
        languages: parsed.data.languages ?? undefined,
        parameterFormat: parsed.data.parameterFormat ?? undefined,
        components: parsed.data.components,
        normalizedTemplate: parsed.data.normalizedTemplate as import('@/shared/whatsapp-template-types').NormalizedTemplate | undefined,
      },
      user.id
    )
    return NextResponse.json({ draft })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create draft'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
