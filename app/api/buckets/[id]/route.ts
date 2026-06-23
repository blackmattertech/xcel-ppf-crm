import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import {
  getBucketById,
  updateBucket,
  deleteBucket,
  getBucketLeads,
} from '@/backend/services/bucket.service'
import { z } from 'zod'

const updateBucketSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  parent_id: z.string().uuid().nullable().optional(),
})

function canReadBuckets(userRole: string | undefined, permissions: string[]) {
  return (
    userRole === SYSTEM_ROLES.ADMIN ||
    userRole === SYSTEM_ROLES.SUPER_ADMIN ||
    userRole === SYSTEM_ROLES.TELE_CALLER ||
    userRole === SYSTEM_ROLES.MARKETING ||
    permissions.includes('buckets.read') ||
    permissions.includes('buckets.manage')
  )
}

function canManageBuckets(userRole: string | undefined, permissions: string[]) {
  return (
    userRole === SYSTEM_ROLES.ADMIN ||
    userRole === SYSTEM_ROLES.SUPER_ADMIN ||
    permissions.includes('buckets.update') ||
    permissions.includes('buckets.manage')
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name
    const permissions = user.role?.permissions?.map((p) => p.name) || []

    if (!canReadBuckets(userRole, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeLeads = searchParams.get('include') === 'leads'

    const bucket = await getBucketById(id)
    if (!bucket) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 })
    }

    if (includeLeads) {
      const leads = await getBucketLeads(id, user.id, userRole)
      return NextResponse.json({ bucket, leads })
    }

    return NextResponse.json(bucket)
  } catch (error) {
    console.error('Error fetching bucket:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch bucket' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name
    const permissions = user.role?.permissions?.map((p) => p.name) || []

    if (!canManageBuckets(userRole, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateBucketSchema.parse(body)

    const bucket = await updateBucket(id, validated)
    return NextResponse.json(bucket)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error updating bucket:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update bucket' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name

    if (userRole !== SYSTEM_ROLES.ADMIN && userRole !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await deleteBucket(id)
    return NextResponse.json({ message: 'Bucket deleted successfully' })
  } catch (error) {
    console.error('Error deleting bucket:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete bucket' },
      { status: 500 }
    )
  }
}
