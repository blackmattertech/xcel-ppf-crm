import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import {
  deleteTemplate,
  getTemplateById,
  updateTemplate,
  type CreateTemplateInput,
  type TemplateCategory,
} from '@/backend/services/whatsapp-template.service'
import { deleteMessageTemplateOnMeta } from '@/backend/services/whatsapp.service'
import { z } from 'zod'

const buttonSchema = z.object({
  type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE']),
  text: z.string().min(1).max(25),
  example: z.string().max(200).optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).max(512).optional(),
  language: z.string().max(10).optional(),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
  body_text: z.string().min(1).max(1024).optional(),
  header_text: z.string().max(60).optional().nullable(),
  footer_text: z.string().max(60).optional().nullable(),
  header_format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
  header_media_url: z.string().max(2000).optional().nullable(),
  buttons: z.array(buttonSchema).max(10).optional(),
})

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
  return NextResponse.json({ template })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

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

  const template = await getTemplateById(id)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  if (template.status !== 'draft') {
    return NextResponse.json(
      { error: 'Only draft templates can be edited' },
      { status: 400 }
    )
  }

  const d = parsed.data
  const input: CreateTemplateInput = {
    name: d.name ?? template.name,
    language: d.language ?? template.language,
    category: (d.category as TemplateCategory) ?? template.category,
    body_text: d.body_text ?? template.body_text,
    header_text: d.header_text !== undefined ? d.header_text : template.header_text,
    footer_text: d.footer_text !== undefined ? d.footer_text : template.footer_text,
    header_format: d.header_format ?? (template.header_format as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT') ?? 'TEXT',
    header_media_url: d.header_media_url !== undefined ? d.header_media_url : template.header_media_url,
    buttons: d.buttons ?? (template.buttons as CreateTemplateInput['buttons']) ?? [],
  }

  try {
    const updated = await updateTemplate(id, input)
    return NextResponse.json({ template: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update template'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
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

  const metaId = template.meta_id?.trim()

  try {
    await deleteTemplate(id)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete template'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (metaId) {
    const metaResult = await deleteMessageTemplateOnMeta(metaId)
    if (!metaResult.success) {
      console.warn(`[WhatsApp templates] Deleted from DB but Meta delete failed for hsm_id=${metaId}:`, metaResult.error)
    }
  }

  return NextResponse.json({ success: true })
}
