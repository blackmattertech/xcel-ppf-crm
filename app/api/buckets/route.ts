import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import {
  getAllBuckets,
  getBucketsWithStats,
  createBucket,
} from '@/backend/services/bucket.service'
import { z } from 'zod'

const createBucketSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  color: z.string().max(20).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
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
    permissions.includes('buckets.create') ||
    permissions.includes('buckets.manage')
  )
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const withStats = searchParams.get('with_stats') === 'true'
    const activeOnly = searchParams.get('active_only') === 'true'

    if (withStats) {
      const buckets = await getBucketsWithStats()
      const totalLeadsTagged = buckets.reduce((sum, b) => sum + b.lead_count, 0)
      return NextResponse.json({
        buckets,
        summary: {
          total_buckets: buckets.length,
          active_buckets: buckets.filter((b) => b.is_active).length,
          total_leads_tagged: totalLeadsTagged,
        },
      })
    }

    const buckets = await getAllBuckets({ activeOnly })
    return NextResponse.json(buckets)
  } catch (error) {
    console.error('Error fetching buckets:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch buckets' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name
    const permissions = user.role?.permissions?.map((p) => p.name) || []

    if (!canManageBuckets(userRole, permissions)) {
      return NextResponse.json(
        { error: 'Forbidden: Only admins can create buckets' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validated = createBucketSchema.parse(body)

    const bucket = await createBucket({
      name: validated.name,
      description: validated.description || undefined,
      color: validated.color,
      is_active: validated.is_active,
      sort_order: validated.sort_order,
      created_by: user.id,
    })

    return NextResponse.json(bucket, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    console.error('Error creating bucket:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create bucket' },
      { status: 500 }
    )
  }
}
