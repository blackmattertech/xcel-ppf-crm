import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { syncMetaLeadsForUser } from '@/backend/jobs/meta-leads-sync.job'
import { PERMISSIONS } from '@/shared/constants/permissions'

/**
 * POST /api/integrations/facebook/leads/sync
 *
 * Fetches all leads from Meta (Facebook Lead Ads) via the Graph API and imports
 * new ones into the CRM. Uses the connected Facebook Business account (page).
 * Duplicates are skipped by meta_lead_id and phone.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_CREATE)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const result = await syncMetaLeadsForUser(user.id)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      message: result.message,
      synced: result.synced,
      skipped: result.skipped,
      failed: result.failed,
      ...(result.failedBatch?.length
        ? { details: { failed: result.failedBatch } }
        : {}),
    })
  } catch (error) {
    console.error('Meta leads sync error:', error)
    const message = error instanceof Error ? error.message : 'Failed to sync leads from Meta'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
