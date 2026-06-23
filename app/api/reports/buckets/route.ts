import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { getBucketReport } from '@/backend/services/bucket.service'

function canViewBucketReport(userRole: string | undefined, permissions: string[]): boolean {
  const rn = userRole?.toLowerCase() ?? ''
  if (rn === SYSTEM_ROLES.SUPER_ADMIN || rn === SYSTEM_ROLES.ADMIN) return true
  return (
    permissions.includes(PERMISSIONS.REPORTS_READ) ||
    permissions.includes(PERMISSIONS.REPORTS_MANAGE) ||
    permissions.includes(PERMISSIONS.BUCKETS_READ) ||
    permissions.includes(PERMISSIONS.BUCKETS_MANAGE)
  )
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const userRole = user.role?.name
    const permissions = user.role?.permissions?.map((p) => p.name) || []

    if (!canViewBucketReport(userRole, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const report = await getBucketReport()
    return NextResponse.json(report)
  } catch (error) {
    console.error('Error fetching bucket report:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch bucket report' },
      { status: 500 }
    )
  }
}
