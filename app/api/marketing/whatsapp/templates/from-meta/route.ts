import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { listMessageTemplatesWithDetails } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/**
 * GET – List message templates from Meta with body/header for variable inputs.
 * Returns only approved/active templates. Used by Bulk WhatsApp to show all sendable templates and param counts.
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireAuth(_request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured', templates: [] },
      { status: 503 }
    )
  }

  const { templates, error } = await listMessageTemplatesWithDetails(wabaConfig)
  if (error) {
    return NextResponse.json(
      { error, templates: [] },
      { status: 502 }
    )
  }

  const approvedOrActive = templates.filter(
    (t) => t.status === 'approved' || t.status === 'active'
  )

  return NextResponse.json({
    templates: approvedOrActive.map((t) => ({
      name: t.name,
      language: t.language,
      category: t.category,
      body_text: t.body_text ?? '',
      header_text: t.header_text ?? null,
    })),
  })
}
