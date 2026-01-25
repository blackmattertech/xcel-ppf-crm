import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getRoleById, updateRole, deleteRole } from '@/backend/services/role.service'
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
    const authResult = await requirePermission(request, PERMISSIONS.ROLES_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { name, description, permissionIds } = updateRoleSchema.parse(body)

    const role = await updateRole(id, name, description || null, permissionIds)

    return NextResponse.json({ role })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
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
