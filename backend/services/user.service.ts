import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type User = Database['public']['Tables']['users']['Row']

export async function getAllUsers() {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  // Transform the data to match expected format (roles might be array or single)
  return (data || []).map((user: any) => ({
    ...user,
    role: Array.isArray(user.roles) ? user.roles[0] : user.roles,
  }))
}

export async function getUserById(id: string) {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(`Failed to fetch user: ${error.message}`)
  }

  // Transform the data to match expected format
  const userData = data as any
  return {
    ...userData,
    role: Array.isArray(userData.roles) ? userData.roles[0] : userData.roles,
  }
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  phone: string | null,
  roleId: string,
  branchId: string | null
) {
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

  // Create user record
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      name,
      phone,
      role_id: roleId,
      branch_id: branchId,
    } as any)
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .single()

  if (userError) {
    // Clean up auth user if user creation fails
    await supabase.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Failed to create user: ${userError.message}`)
  }

  // Transform the data to match expected format
  const userData = user as any
  return {
    ...userData,
    role: Array.isArray(userData.roles) ? userData.roles[0] : userData.roles,
  }
}

export async function updateUser(
  id: string,
  name: string,
  phone: string | null,
  roleId: string,
  branchId: string | null
) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .update({
      name,
      phone,
      role_id: roleId,
      branch_id: branchId,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id)
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update user: ${error.message}`)
  }

  // Transform the data to match expected format
  const userData = data as any
  return {
    ...userData,
    role: Array.isArray(userData.roles) ? userData.roles[0] : userData.roles,
  }
}

export async function deleteUser(id: string) {
  const supabase = createServiceClient()

  // Delete auth user (this will cascade delete the user record due to foreign key)
  const { error } = await supabase.auth.admin.deleteUser(id)

  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`)
  }
}
