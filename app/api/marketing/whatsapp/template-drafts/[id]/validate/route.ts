import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getDraft } from '@/backend/services/whatsapp-template-draft.service'
import { validateTemplate } from '@/backend/services/whatsapp-template-validation.service'
import type { NormalizedTemplate } from '@/shared/whatsapp-template-types'

export async function POST(
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
  const normalized = draft.normalized_template_json as NormalizedTemplate | null
  if (!normalized) {
    return NextResponse.json(
      { error: 'Draft has no normalized template', errors: [], warnings: [] },
      { status: 400 }
    )
  }
  const result = validateTemplate(normalized)
  return NextResponse.json({
    errors: result.errors,
    warnings: result.warnings,
    valid: result.errors.length === 0,
  })
}
