import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requirePermission } from '@/backend/middleware/auth'
import { getUserById, updateUser, deleteUser } from '@/backend/services/user.service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const updateUserSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  doj: z.string().nullable().optional(),
  languagesKnown: z.array(z.string()).nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Allow users to read their own profile OR require USERS_READ permission for others
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user: currentUser } = authResult
    const isOwnProfile = currentUser.id === id

    // If reading someone else's profile, require USERS_READ permission
    if (!isOwnProfile) {
      const permissionResult = await requirePermission(request, PERMISSIONS.USERS_READ)
      if ('error' in permissionResult) {
        return permissionResult.error
      }
    }

    const user = await getUserById(id)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Allow users to update their own profile OR require USERS_UPDATE permission for others
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user: currentUser } = authResult
    const isOwnProfile = currentUser.id === id
    const isAdmin = currentUser.role.name === 'super_admin' || currentUser.role.name === 'admin'

    // If editing someone else's profile, require USERS_UPDATE permission
    if (!isOwnProfile) {
      const permissionResult = await requirePermission(request, PERMISSIONS.USERS_UPDATE)
      if ('error' in permissionResult) {
        return permissionResult.error
      }
    }

    const body = await request.json()
    let { name, phone, roleId, branchId, profileImageUrl, address, dob, doj, languagesKnown } = updateUserSchema.parse(body)

    // If user is editing their own profile, prevent role change unless they're admin
    if (isOwnProfile && !isAdmin) {
      // Get current user's role and keep it
      const { getUserById } = await import('@/backend/services/user.service')
      const currentUserData = await getUserById(id)
      roleId = (currentUserData as any).role?.id || roleId
    }

    const user = await updateUser(
      id, 
      name, 
      phone || null, 
      roleId, 
      branchId || null,
      profileImageUrl || null,
      address || null,
      dob || null,
      doj || null,
      languagesKnown || null
    )

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.USERS_DELETE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    await deleteUser(id)
    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete user' },
      { status: 500 }
    )
  }
}
