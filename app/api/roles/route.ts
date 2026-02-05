import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getAllRoles, createRole } from '@/backend/services/role.service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  permissionIds: z.array(z.string().uuid()),
})

export async function GET(request: NextRequest) {
  try {
    console.log('GET /api/roles - Starting authentication check')
    const authResult = await requirePermission(request, PERMISSIONS.ROLES_READ)
    
    if ('error' in authResult) {
      console.log('GET /api/roles - Authentication failed:', authResult.error)
      return authResult.error
    }

    console.log('GET /api/roles - Authentication successful, fetching roles')
    const roles = await getAllRoles()
    return NextResponse.json({ roles })
  } catch (error) {
    console.error('GET /api/roles - Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch roles' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.ROLES_CREATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    console.log('Received role creation request:', body)
    
    // Validate permissionIds
    if (!body.permissionIds || !Array.isArray(body.permissionIds) || body.permissionIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one permission is required', details: 'permissionIds must be a non-empty array' },
        { status: 400 }
      )
    }
    
    const { name, description, permissionIds } = createRoleSchema.parse(body)
    console.log('Parsed role data:', { name, description, permissionIds })

    const role = await createRole(name, description || null, permissionIds, authResult.user.id)

    return NextResponse.json({ role }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create role' },
      { status: 500 }
    )
  }
}
