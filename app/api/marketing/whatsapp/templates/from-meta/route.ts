import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { listMessageTemplatesFromMeta, getWhatsAppWabaConfig } from '@/backend/services/whatsapp.service'

/**
 * GET – List message templates from Meta (so templates created on Meta, e.g. hello_world, appear in the app).
 * Returns only approved/active templates. Used by Bulk WhatsApp to show all sendable templates.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const wabaConfig = getWhatsAppWabaConfig()
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured', templates: [] },
      { status: 503 }
    )
  }

  const { templates, error } = await listMessageTemplatesFromMeta(wabaConfig)
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
    })),
  })
}
