import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import {
  buildBucketLeadsCsv,
  getBucketById,
  getBucketLeadsForExport,
} from '@/backend/services/bucket.service'
import { slugifyForFilename } from '@/shared/utils/csv'

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
    const bucket = await getBucketById(id)
    if (!bucket) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 })
    }

    const rows = await getBucketLeadsForExport(id, user.id, userRole)
    const csv = buildBucketLeadsCsv(rows)
    const filename = `${slugifyForFilename(bucket.name)}-leads-${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Error exporting bucket leads:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export bucket leads' },
      { status: 500 }
    )
  }
}
