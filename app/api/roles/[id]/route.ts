import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requirePermission } from '@/backend/middleware/auth'
import { getRoleById, updateRole, deleteRole } from '@/backend/services/role.service'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const updateRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  permissionIds: z.array(z.string().uuid()),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.ROLES_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const role = await getRoleById(id)
    return NextResponse.json({ role })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch role' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Allow admin and super_admin to update role permissions
    // Admin doesn't have roles.update permission but should be able to update permissions
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name

    // Only admin and super_admin can update roles
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can update roles' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, description, permissionIds } = updateRoleSchema.parse(body)

    // Check if role is system role - if so, allow permission updates only
    const supabase = createServiceClient()
    const { data: existingRole } = await supabase
      .from('roles')
      .select('is_system_role')
      .eq('id', id)
      .single()

    const isSystemRole = (existingRole as any)?.is_system_role

    // For system roles, allow permission updates (admin/super_admin can update permissions)
    // For non-system roles, allow full updates
    const role = await updateRole(
      id,
      name,
      description || null,
      permissionIds,
      isSystemRole // Allow system role permission updates
    )

    return NextResponse.json({ role })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update role' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.ROLES_DELETE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    await deleteRole(id)
    return NextResponse.json({ message: 'Role deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete role' },
      { status: 500 }
    )
  }
}
