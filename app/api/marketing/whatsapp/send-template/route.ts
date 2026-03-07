import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { sendTemplateBulk, listMessageTemplatesWithDetails } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { saveOutgoingMessage } from '@/backend/services/whatsapp-chat.service'
import { getTemplateById, getTemplateByName, getTemplateByNameAndLanguage } from '@/backend/services/whatsapp-template.service'
import { z } from 'zod'

/** True if two names are likely the same (e.g. welcom vs welcome). */
function templateNameSimilar(a: string, b: string): boolean {
  const x = a.toLowerCase().trim()
  const y = b.toLowerCase().trim()
  if (x === y) return true
  if (Math.abs(x.length - y.length) > 1) return false
  if (x.length === y.length) {
    let diff = 0
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++
    return diff <= 1
  }
  const [short, long] = x.length < y.length ? [x, y] : [y, x]
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true
  }
  return false
}

const sendSchema = z.object({
  templateId: z.string().uuid().optional(),
  templateName: z.string().min(1).optional(),
  templateLanguage: z.string().optional().default('en'),
  recipients: z.array(z.object({ phone: z.string().min(1), name: z.string().optional() })).min(1).max(100),
  bodyParameters: z.array(z.string()).optional(),
  headerParameters: z.array(z.string()).optional(),
  defaultCountryCode: z.string().max(4).optional().default('91'),
})

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { config, wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!config || !wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp API not configured. Link in Settings → Integrations or set env vars.' },
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
  /** Resolved from DB when using templateId or templateName (used for header_format, header_media_url). */
  let dbTemplate: Awaited<ReturnType<typeof getTemplateById>> = null

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
    dbTemplate = template
    templateName = template.name
    templateLanguage = template.language
  } else if (parsed.data.templateName) {
    templateName = parsed.data.templateName
    const providedLang = (parsed.data.templateLanguage ?? '').trim().replace(/-/g, '_')
    if (providedLang) {
      templateLanguage = providedLang
      dbTemplate = await getTemplateByNameAndLanguage(templateName, templateLanguage)
    } else {
      const localTemplate = await getTemplateByName(templateName)
      templateLanguage = (localTemplate?.language ?? 'en').trim().replace(/-/g, '_') || 'en'
      dbTemplate = localTemplate ?? (await getTemplateByNameAndLanguage(templateName, templateLanguage))
    }
  } else {
    return NextResponse.json({ error: 'Provide templateId or templateName' }, { status: 400 })
  }

  // Avoid #132001: ensure this template name+language exists in Meta (or suggest correct name)
  const metaList = await listMessageTemplatesWithDetails(wabaConfig)
  const norm = (s: string) => (s ?? '').trim().replace(/-/g, '_').toLowerCase()
  const metaTemplate = metaList.templates?.find(
    (m) => m.name === templateName && norm(m.language ?? '') === norm(templateLanguage)
  )
  const existsInMeta = !!metaTemplate
  if (!existsInMeta) {
    // Check Meta list for a similar template name (e.g. welcome vs welcom)
    const similar = metaList.templates?.find((m) => templateNameSimilar(templateName, m.name))
    if (similar) {
      return NextResponse.json(
        {
          error: `Template "${templateName}" does not exist in Meta for language ${templateLanguage}. Did you mean "${similar.name}"? Pick the option "${similar.name} (${similar.language}) — from Meta" in the dropdown.`,
          code: 'TEMPLATE_NAME_MISMATCH',
          suggestedName: similar.name,
          suggestedLanguage: similar.language,
        },
        { status: 400 }
      )
    }
    // Known typo: "welcom" → "welcome" (block even when Meta list is empty)
    if (templateName.toLowerCase() === 'welcom') {
      return NextResponse.json(
        {
          error: `Template name "welcom" is likely a typo. In Meta the template is usually named "welcome". Go to Message templates → Sync, then pick "welcome (en_US) — from Meta" in the dropdown (or create a template named exactly "welcome" in Meta).`,
          code: 'TEMPLATE_NAME_MISMATCH',
          suggestedName: 'welcome',
          suggestedLanguage: templateLanguage,
        },
        { status: 400 }
      )
    }
  }

  const bodyParams = parsed.data.bodyParameters ?? []
  const recipients = parsed.data.recipients.map((r) => ({
    phone: r.phone,
    bodyParameters: bodyParams.length > 0 ? bodyParams : undefined,
  }))

  // #132012: use DB template info; prefer Meta upload ID (header_media_id) when sending
  const headerFormat = dbTemplate?.header_format ?? metaTemplate?.header_format ?? undefined
  const requestHeaderParams = parsed.data.headerParameters && parsed.data.headerParameters.length > 0 ? parsed.data.headerParameters : undefined
  const headerMediaId = (dbTemplate as { header_media_id?: string | null } | undefined)?.header_media_id?.trim()
  const headerParameters =
    requestHeaderParams ??
    (headerMediaId ? [headerMediaId] : headerFormat && headerFormat !== 'TEXT' && dbTemplate?.header_media_url ? [dbTemplate.header_media_url] : undefined)

  const result = await sendTemplateBulk(
    recipients,
    templateName,
    templateLanguage,
    {
      delayMs: 250,
      defaultCountryCode: parsed.data.defaultCountryCode,
      headerParameters,
      headerFormat,
      headerMediaId: headerMediaId || undefined,
      config,
    }
  )

  const bodyForChat = `[Template: ${templateName}]`
  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i]
    if (r.success) {
      const recipient = recipients[i]
      await saveOutgoingMessage({
        leadId: null,
        phone: recipient?.phone ?? r.phone,
        body: bodyForChat,
        metaMessageId: r.messageId ?? undefined,
      })
    }
  }

  return NextResponse.json({
    sent: result.sent,
    failed: result.failed,
    results: result.results,
  })
}
