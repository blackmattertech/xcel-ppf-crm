import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getWhatsAppConfig, sendTemplateBulk } from '@/backend/services/whatsapp.service'
import { getTemplateById, getApprovedTemplateByName, getTemplateByName } from '@/backend/services/whatsapp-template.service'
import { z } from 'zod'

const sendSchema = z.object({
  templateId: z.string().uuid().optional(),
  templateName: z.string().min(1).optional(),
  templateLanguage: z.string().optional().default('en'),
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(100),
  bodyParameters: z.array(z.string()).optional(),
  defaultCountryCode: z.string().max(4).optional().default('91'),
})

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  if (!getWhatsAppConfig()) {
    return NextResponse.json(
      { error: 'WhatsApp API not configured' },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  let templateName: string
  let templateLanguage: string

  if (parsed.data.templateId) {
    const template = await getTemplateById(parsed.data.templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    if (template.status !== 'approved') {
      return NextResponse.json(
        { error: 'Only approved templates can be used for broadcast. Current status: ' + template.status },
        { status: 400 }
      )
    }
    templateName = template.name
    templateLanguage = template.language
  } else if (parsed.data.templateName) {
    templateName = parsed.data.templateName
    const localTemplate = await getTemplateByName(templateName)
    templateLanguage = (localTemplate?.language ?? 'en').trim()
    if (!templateLanguage || templateLanguage.toLowerCase() === 'en_us' || templateLanguage.toLowerCase().startsWith('en_')) {
      templateLanguage = 'en'
    }
  } else {
    return NextResponse.json({ error: 'Provide templateId or templateName' }, { status: 400 })
  }

  const bodyParams = parsed.data.bodyParameters ?? []
  const recipients = parsed.data.recipients.map((r) => ({
    phone: r.phone,
    bodyParameters: bodyParams.length > 0 ? bodyParams : undefined,
  }))

  const result = await sendTemplateBulk(
    recipients,
    templateName,
    templateLanguage,
    { delayMs: 250, defaultCountryCode: parsed.data.defaultCountryCode }
  )

  return NextResponse.json({
    sent: result.sent,
    failed: result.failed,
    results: result.results,
  })
}
