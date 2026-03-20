import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getDraft, updateDraft } from '@/backend/services/whatsapp-template-draft.service'
import * as repo from '@/backend/services/whatsapp-template-repository.service'
import { z } from 'zod'

const updateSchema = z.object({
  wabaId: z.string().optional().nullable(),
  category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']).optional(),
  templateSubtype: z
    .enum([
      'STANDARD',
      'AUTHENTICATION_OTP',
      'CALL_PERMISSION_REQUEST',
      'CATALOG',
      'LIMITED_TIME_OFFER',
      'PRODUCT_CARD_CAROUSEL',
    ])
    .optional(),
  name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/).optional(),
  language: z.string().max(10).optional().nullable(),
  languages: z.array(z.string().max(10)).optional().nullable(),
  parameterFormat: z.enum(['named', 'positional']).optional().nullable(),
  components: z.unknown().optional(),
  normalizedTemplate: z.unknown().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(_request)
  if ('error' in authResult) return authResult.error
  const { id } = await params
  const draft = await getDraft(id)
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  return NextResponse.json({ draft })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error
  const { user } = authResult
  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const updated = await updateDraft(id, { ...parsed.data, normalizedTemplate: parsed.data.normalizedTemplate as never }, user.id)
  if (!updated) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  return NextResponse.json({ draft: updated })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(_request)
  if ('error' in authResult) return authResult.error
  const { id } = await params
  const draft = await getDraft(id)
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  try {
    await repo.deleteDraft(id)
    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete draft'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
