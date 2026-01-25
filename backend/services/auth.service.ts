import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SYSTEM_ROLES } from '@/shared/constants/roles'

export async function createInitialSuperAdmin(email: string, password: string, name: string) {
  const supabase = createServiceClient()

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`)
  }

  // Get super_admin role
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', SYSTEM_ROLES.SUPER_ADMIN)
    .single()

  if (roleError || !role) {
    throw new Error('Super admin role not found. Please run migrations first.')
  }

  // Create user record
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      name,
      role_id: role.id,
    })
    .select()
    .single()

  if (userError) {
    // Clean up auth user if user creation fails
    await supabase.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Failed to create user: ${userError.message}`)
  }

  return user
}

export async function login(email: string, password: string) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Login failed')
  }

  // Get user with role
  const { data: user, error: userError } = await supabase
    .from('users')
    .select(`
      *,
      role:roles (
        *,
        permissions:role_permissions (
          permission:permissions (*)
        )
      )
    `)
    .eq('id', data.user.id)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  return {
    user: {
      ...user,
      role: {
        ...user.role,
        permissions: user.role.role_permissions.map((rp: any) => rp.permission),
      },
    },
    session: data.session,
  }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
