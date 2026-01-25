import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getAllPermissions } from '@/backend/services/role.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function GET(request: NextRequest) {
  try {
    console.log('GET /api/permissions - Starting authentication check')
    const authResult = await requirePermission(request, PERMISSIONS.ROLES_READ)
    
    if ('error' in authResult) {
      console.log('GET /api/permissions - Authentication failed:', authResult.error)
      return authResult.error
    }

    console.log('GET /api/permissions - Authentication successful, fetching permissions')
    const permissions = await getAllPermissions()
    return NextResponse.json({ permissions })
  } catch (error) {
    console.error('GET /api/permissions - Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch permissions' },
      { status: 500 }
    )
  }
}
