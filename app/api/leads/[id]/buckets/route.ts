import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { getBucketsForLead, setLeadBuckets } from '@/backend/services/lead-bucket.service'
import { getEnrollmentsForLead } from '@/backend/services/whatsapp-automation.service'
import { invalidateLeadCaches } from '@/lib/cache-invalidation'
import { z } from 'zod'

const setBucketsSchema = z.object({
  bucket_ids: z.array(z.string().uuid()).optional(),
  bucketIds: z.array(z.string().uuid()).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const buckets = await getBucketsForLead(leadId)
    return NextResponse.json({ buckets })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch lead buckets'
    const status = message.includes('Forbidden') ? 403 : message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const body = await request.json()
    const validated = setBucketsSchema.parse(body)
    const bucketIds = validated.bucket_ids ?? validated.bucketIds ?? []

    const buckets = await setLeadBuckets(leadId, bucketIds, user.id, user.id, user.role.name)
    const enrollments = await getEnrollmentsForLead(leadId)
    await invalidateLeadCaches(leadId)
    return NextResponse.json({ buckets, enrollments })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Failed to update lead buckets'
    const status = message.includes('Forbidden') ? 403 : message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
