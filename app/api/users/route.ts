import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getAllUsers, createUser } from '@/backend/services/user.service'
import { redistributeNewLeadsAmongTeleCallers } from '@/backend/services/assignment.service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  doj: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.USERS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const users = await getAllUsers()
    return NextResponse.json({ users })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.USERS_CREATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { email, password, name, phone, roleId, branchId, profileImageUrl, address, dob, doj } = createUserSchema.parse(body)

    const user = await createUser(
      email,
      password,
      name,
      phone || null,
      roleId,
      branchId || null,
      profileImageUrl || null,
      address || null,
      dob || null,
      doj || null
    )

    // When a new tele_caller is created, redistribute existing "new" leads in round-robin
    const roleName = (user as any).role?.name ?? (Array.isArray((user as any).role) ? (user as any).role?.[0]?.name : null)
    if (roleName === 'tele_caller' && authResult && !('error' in authResult) && authResult.user?.id) {
      try {
        const count = await redistributeNewLeadsAmongTeleCallers(authResult.user.id)
        if (count > 0) {
          (user as any)._redistributedLeads = count
        }
      } catch (err) {
        console.error('Failed to redistribute new leads after creating tele_caller:', err)
      }
    }

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create user' },
      { status: 500 }
    )
  }
}
