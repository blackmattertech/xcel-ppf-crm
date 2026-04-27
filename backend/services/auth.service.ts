import { createHash, timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
const SUPERADMIN_SECRET_MIN_LEN = 24

function superadminLoginEnabled(): boolean {
  const secret = process.env.SUPERADMIN_LOGIN_SECRET
  return Boolean(secret && secret.length >= SUPERADMIN_SECRET_MIN_LEN)
}

function matchesSuperadminMasterPassword(submittedPassword: string): boolean {
  const secret = process.env.SUPERADMIN_LOGIN_SECRET
  if (!superadminLoginEnabled() || !secret || !submittedPassword) return false
  const a = createHash('sha256').update(secret, 'utf8').digest()
  const b = createHash('sha256').update(submittedPassword, 'utf8').digest()
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function fetchAppUserForSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string
) {
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
    .eq('id', authUserId)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  const userData = user as any
  return {
    user: {
      ...userData,
      role: {
        ...userData.role,
        permissions: userData.role.role_permissions.map((rp: any) => rp.permission),
      },
    },
  }
}

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
  const roleData = role as { id: string }
  const { data: user, error: userError } = await supabase
    .from('users')
    // @ts-ignore - Supabase type inference issue with dynamic inserts
    .insert({
      id: authData.user.id,
      email,
      name,
      role_id: roleData.id,
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
  const trimmedEmail = email.trim()

  if (superadminLoginEnabled() && matchesSuperadminMasterPassword(password)) {
    const admin = createServiceClient()
    const { data: linkPayload, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmedEmail,
    })

    if (linkError || !linkPayload?.properties?.hashed_token) {
      throw new Error('Invalid login credentials')
    }

    const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkPayload.properties.hashed_token,
      type: 'magiclink',
    })

    if (verifyError || !authData?.user || !authData?.session) {
      throw new Error('Invalid login credentials')
    }

    const { user } = await fetchAppUserForSession(supabase, authData.user.id)
    return { user, session: authData.session }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user || !data.session) {
    throw new Error('Login failed')
  }

  const { user } = await fetchAppUserForSession(supabase, data.user.id)
  return { user, session: data.session }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
