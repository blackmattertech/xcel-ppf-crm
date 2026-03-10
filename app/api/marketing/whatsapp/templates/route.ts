import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import {
  createTemplate,
  listTemplates,
  sanitizeTemplateName,
  type CreateTemplateInput,
  type TemplateCategory,
  type TemplateStatus,
} from '@/backend/services/whatsapp-template.service'
import { z } from 'zod'

const buttonSchema = z.object({
  type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE']),
  text: z.string().min(1).max(25),
  example: z.string().max(200).optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().max(10).optional().default('en'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  sub_category: z.enum(['ORDER_DETAILS', 'ORDER_STATUS', 'RICH_ORDER_STATUS']).optional().nullable(),
  body_text: z.string().min(1).max(1024),
  header_text: z.string().max(60).optional().nullable(),
  footer_text: z.string().max(60).optional().nullable(),
  header_format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional().default('TEXT'),
  header_media_url: z.string().max(2000).optional().nullable(),
  header_media_id: z.string().max(500).optional().nullable(),
  buttons: z.array(buttonSchema).max(10).optional().default([]),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const statusParam = request.nextUrl.searchParams.get('status')
  const categoryParam = request.nextUrl.searchParams.get('category')
  const filters: { status?: TemplateStatus; category?: TemplateCategory } = {}
  if (statusParam && ['draft', 'pending', 'approved', 'rejected'].includes(statusParam)) {
    filters.status = statusParam as TemplateStatus
  }
  if (categoryParam && ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(categoryParam)) {
    filters.category = categoryParam as TemplateCategory
  }
  try {
    const templates = await listTemplates(Object.keys(filters).length ? filters : undefined)
    return NextResponse.json({ templates })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list templates'
    const tableMissing = message.includes('whatsapp_templates') && message.includes('does not exist')
    return NextResponse.json(
      { error: message, ...(tableMissing && { detail: 'Run database/migrations/017_whatsapp_templates.sql in Supabase SQL Editor.' }) },
      { status: tableMissing ? 503 : 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

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

  const input: CreateTemplateInput = {
    name: sanitizeTemplateName(parsed.data.name) || 'template',
    language: parsed.data.language,
    category: parsed.data.category as TemplateCategory,
    sub_category: parsed.data.sub_category ?? null,
    body_text: parsed.data.body_text,
    header_text: parsed.data.header_text ?? null,
    footer_text: parsed.data.footer_text ?? null,
    header_format: parsed.data.header_format ?? 'TEXT',
    header_media_url: parsed.data.header_media_url ?? null,
    header_media_id: parsed.data.header_media_id ?? null,
    buttons: parsed.data.buttons ?? [],
  }

  try {
    const template = await createTemplate(input, authResult.user.id)
    return NextResponse.json({ template })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create template'
    const tableMissing = message.includes('whatsapp_templates') || message.includes('017_whatsapp_templates')
    return NextResponse.json(
      { error: message, ...(tableMissing && { detail: 'Run database/migrations/017_whatsapp_templates.sql in Supabase SQL Editor.' }) },
      { status: tableMissing ? 503 : 500 }
    )
  }
}
