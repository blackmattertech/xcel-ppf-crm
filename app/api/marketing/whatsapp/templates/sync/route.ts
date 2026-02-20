import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { listTemplates, updateTemplateMetaStatus, updateTemplateMetaLanguage } from '@/backend/services/whatsapp-template.service'
import { listMessageTemplatesFromMeta, getWhatsAppWabaConfig } from '@/backend/services/whatsapp.service'

/**
 * Sync template status from Meta (pending → approved/rejected).
 * Call after submitting templates to refresh approval state.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const wabaConfig = getWhatsAppWabaConfig()
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured' },
      { status: 503 }
    )
  }

  const { templates: metaTemplates, error: metaError } = await listMessageTemplatesFromMeta(wabaConfig)
  if (metaError) {
    const hint = /does not exist|missing permissions|does not support/i.test(metaError)
      ? ' Use the correct WHATSAPP_BUSINESS_ACCOUNT_ID (from Business Manager → Accounts → WhatsApp Accounts) and a token with whatsapp_business_management permission.'
      : ''
    return NextResponse.json(
      {
        error: 'Unable to sync templates from Meta',
        detail: metaError + hint,
      },
      { status: 502 }
    )
  }

  const localTemplates = await listTemplates()

  function metaStatusToLocal(metaStatus: string): 'approved' | 'pending' | 'rejected' {
    const s = (metaStatus || '').toLowerCase()
    if (s === 'approved' || s === 'active') return 'approved'
    if (s === 'rejected') return 'rejected'
    return 'pending'
  }

  /** Match by name and language (exact or base match so "en" matches Meta "en_US" for sync). */
  function metaMatchesLocal(meta: { name: string; language: string }, local: { name: string; language: string }): boolean {
    if (meta.name !== local.name) return false
    const mL = meta.language?.trim() || ''
    const lL = local.language?.trim() || ''
    if (mL === lL) return true
    if (mL.startsWith(lL + '_') || lL.startsWith(mL + '_')) return true
    return false
  }

  let updated = 0
  for (const local of localTemplates) {
    const meta = metaTemplates.find((m) => metaMatchesLocal(m, local))
    if (!meta) continue
    const status = metaStatusToLocal(meta.status)
    await updateTemplateMetaStatus(
      local.id,
      meta.id ?? null,
      status,
      status === 'rejected' ? 'Rejected by Meta' : undefined
    )
    // Use Meta's exact language (and name) so send-template avoids #132001 mismatch
    await updateTemplateMetaLanguage(local.id, meta.language, meta.name)
    updated++
  }

  return NextResponse.json({ success: true, updated, metaCount: metaTemplates.length })
}
