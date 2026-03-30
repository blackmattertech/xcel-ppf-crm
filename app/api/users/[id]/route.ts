import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requirePermission } from '@/backend/middleware/auth'
import { getUserById, updateUser, deleteUser } from '@/backend/services/user.service'
import { redistributeNewLeadsAmongTeleCallers } from '@/backend/services/assignment.service'
import { ASSIGNABLE_LEAD_ROLES } from '@/shared/constants/roles'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  roleId: z.string().uuid().optional(),
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

    const existingUser = await getUserById(id) as {
      name?: string
      role?: { id?: string } | null
      branch_id?: string | null
    }

    // Support partial updates (e.g. phone-only updates from team dialogs)
    name = name ?? existingUser.name ?? ''
    roleId = roleId ?? existingUser.role?.id
    if (branchId === undefined) {
      branchId = existingUser.branch_id ?? null
    }

    if (!name || !roleId) {
      return NextResponse.json(
        { error: 'Missing required fields: name and roleId' },
        { status: 400 }
      )
    }

    // If user is editing their own profile, prevent role change unless they're admin
    if (isOwnProfile && !isAdmin) {
      // Get current user's role and keep it
      const currentUserData = existingUser as any
      roleId = (currentUserData as any).role?.id || roleId
    }

    if (!roleId) {
      return NextResponse.json(
        { error: 'Missing required fields: name and roleId' },
        { status: 400 }
      )
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

    // When a user's role is updated to tele_caller or sales, redistribute existing "new" leads in round-robin
    const roleName = (user as any).role?.name ?? (Array.isArray((user as any).role) ? (user as any).role?.[0]?.name : null)
    if (roleName && ASSIGNABLE_LEAD_ROLES.includes(roleName as any) && !('error' in authResult) && authResult.user?.id) {
      try {
        const count = await redistributeNewLeadsAmongTeleCallers(authResult.user.id)
        if (count > 0) {
          (user as any)._redistributedLeads = count
        }
      } catch (err) {
        console.error('Failed to redistribute new leads after updating user to assignable role:', err)
      }
    }

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const normalizedId = typeof id === 'string' ? id.trim().toLowerCase() : ''

    if (!normalizedId || !UUID_REGEX.test(normalizedId)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400 }
      )
    }

    const authResult = await requirePermission(request, PERMISSIONS.USERS_DELETE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    // Pass current user id to reassign records (quotations, etc.) before deletion
    const reassignToUserId = authResult.user.id !== normalizedId ? authResult.user.id : undefined
    await deleteUser(normalizedId, reassignToUserId)
    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete user' },
      { status: 500 }
    )
  }
}
