import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createMessageTemplateFromLibrary } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().min(1).max(20),
  library_template_name: z.string().min(1),
  library_template_button_inputs: z.string().optional(),
})

/**
 * POST – Create a template in your WABA from Meta's Template Library (pre-approved).
 * Body: name, language, library_template_name, library_template_button_inputs (optional JSON string)
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured' },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const result = await createMessageTemplateFromLibrary(
    {
      name: parsed.data.name,
      language: parsed.data.language,
      library_template_name: parsed.data.library_template_name,
      library_template_button_inputs: parsed.data.library_template_button_inputs,
    },
    wabaConfig
  )

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to create template from library' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    success: true,
    message: 'Template added to your account from the library.',
    id: result.id,
    status: result.status,
  })
}
