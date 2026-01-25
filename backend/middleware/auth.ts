import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { UserWithRole } from '@/shared/types/auth'

export interface AuthenticatedRequest extends NextRequest {
  user?: UserWithRole
}

export async function requireAuth(
  request: NextRequest
): Promise<{ user: UserWithRole; response?: NextResponse } | { error: NextResponse }> {
  // For API routes, we need to create the client from the request directly
  // to properly handle cookies from the incoming request
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      ),
    }
  }
  
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll() {
        // In API routes, cookie setting is handled by the response
        // This is a no-op here
      },
    },
  })
  
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !authUser) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  // Get user with role and permissions
  // Use explicit foreign key relationship: users_role_id_fkey
  const { data: user, error: userError } = await supabase
    .from('users')
    .select(`
      *,
      roles!users_role_id_fkey (
        *,
        role_permissions (
          permissions (*)
        )
      )
    `)
    .eq('id', authUser.id)
    .single()

  if (userError) {
    console.error('Error fetching user from database:', userError)
    return {
      error: NextResponse.json(
        { error: 'User not found in database', details: userError.message },
        { status: 404 }
      ),
    }
  }

  if (!user) {
    console.error('User not found in database for auth user:', authUser.id)
    return {
      error: NextResponse.json(
        { error: 'User not found in database. Please contact administrator.' },
        { status: 404 }
      ),
    }
  }

  // Flatten permissions
  const userData = user as any
  
  // Check if role exists (note: Supabase returns it as 'roles' array, but should be single)
  const roleData = Array.isArray(userData.roles) ? userData.roles[0] : userData.roles
  
  if (!roleData) {
    console.error('User has no role assigned:', userData.id, 'role_id:', userData.role_id)
    return {
      error: NextResponse.json(
        { error: 'User role not found. Please contact administrator.' },
        { status: 404 }
      ),
    }
  }

  // Extract permissions from role_permissions
  const permissions = (roleData.role_permissions || []).map((rp: any) => rp.permissions).filter(Boolean)

  const userWithRole: UserWithRole = {
    ...userData,
    role: {
      ...roleData,
      permissions: permissions,
    },
  }

  return { user: userWithRole }
}

export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<{ user: UserWithRole; response?: NextResponse } | { error: NextResponse }> {
  const authResult = await requireAuth(request)
  
  if ('error' in authResult) {
    return authResult
  }

  const { user } = authResult

  // Super admin has all permissions
  if (user.role.name === 'super_admin') {
    return { user }
  }

  // Check if user has the required permission
  const hasPermission = user.role.permissions.some(
    (p) => p.name === permission || p.name === `${permission.split('.')[0]}.manage`
  )

  if (!hasPermission) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      ),
    }
  }

  return { user }
}
