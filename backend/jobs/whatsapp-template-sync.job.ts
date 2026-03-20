/**
 * Sync template status/category from Meta to local DB.
 * Call from cron (e.g. POST /api/cron/whatsapp-template-sync) or manually.
 */

import { listTemplates } from '@/backend/services/whatsapp-meta-template-client.service'
import { getWhatsAppWabaConfig } from '@/backend/services/whatsapp.service'
import * as repo from '@/backend/services/whatsapp-template-repository.service'

export interface SyncResult {
  ok: boolean
  synced: number
  errors: string[]
}

export async function runTemplateSync(): Promise<SyncResult> {
  const config = getWhatsAppWabaConfig()
  if (!config) {
    return { ok: false, synced: 0, errors: ['WhatsApp Business Account not configured (WHATSAPP_BUSINESS_ACCOUNT_ID or token missing)'] }
  }
  const result = await listTemplates({
    wabaId: config.wabaId,
    accessToken: config.accessToken,
    fields: 'id,name,status,language,category,correct_category',
  })
  if (!result.success || !result.templates) {
    return { ok: false, synced: 0, errors: [result.error ?? 'Failed to list templates from Meta'] }
  }
  const errors: string[] = []
  let synced = 0
  for (const t of result.templates as Array<{ id?: string; status?: string; category?: string; correct_category?: string }>) {
    const metaId = t.id
    if (!metaId) continue
    const local = await repo.getTemplateByMetaId(metaId)
    if (!local?.id) continue
    const oldStatus = (local.meta_status ?? local.status) as string | undefined
    const oldCategory = (local.correct_category ?? local.category) as string | undefined
    const newStatus = (t.status ?? oldStatus) ?? ''
    const newCategory = (t.correct_category ?? t.category ?? oldCategory) ?? ''
    if (oldStatus === newStatus && oldCategory === newCategory) continue
    try {
      await repo.updateTemplateStatus(local.id as string, {
        meta_status: newStatus,
        correct_category: newCategory || undefined,
        last_sync_at: new Date().toISOString(),
      })
      await repo.insertStatusHistory({
        whatsapp_template_id: local.id as string,
        old_status: oldStatus ?? null,
        new_status: newStatus || null,
        old_category: oldCategory ?? null,
        new_category: newCategory || null,
        source: 'poll',
        reason: null,
      })
      synced++
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { ok: true, synced, errors }
}
