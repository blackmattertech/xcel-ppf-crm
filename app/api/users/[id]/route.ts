import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getUserById, updateUser, deleteUser } from '@/backend/services/user.service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const updateUserSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.USERS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const user = await getUserById(params.id)
    return NextResponse.json({ user })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.USERS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { name, phone, roleId, branchId } = updateUserSchema.parse(body)

    const user = await updateUser(params.id, name, phone || null, roleId, branchId || null)

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.USERS_DELETE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    await deleteUser(params.id)
    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete user' },
      { status: 500 }
    )
  }
}
