import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type Role = Database['public']['Tables']['roles']['Row']
type Permission = Database['public']['Tables']['permissions']['Row']

export async function getAllRoles() {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('roles')
    .select(`
      *,
      permissions:role_permissions (
        permission:permissions (*)
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch roles: ${error.message}`)
  }

  return (data || []).map((role: any) => ({
    ...role,
    permissions: (role.permissions || []).map((rp: any) => rp.permission),
  }))
}

export async function getRoleById(id: string) {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('roles')
    .select(`
      *,
      permissions:role_permissions (
        permission:permissions (*)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(`Failed to fetch role: ${error.message}`)
  }

  const roleData = data as any
  return {
    ...roleData,
    permissions: (roleData.permissions || []).map((rp: any) => rp.permission),
  }
}

export async function createRole(
  name: string,
  description: string | null,
  permissionIds: string[],
  createdBy: string
) {
  const supabase = createServiceClient()

  // Check if role name already exists
  const { data: existing } = await supabase
    .from('roles')
    .select('id')
    .eq('name', name)
    .single()

  if (existing) {
    throw new Error('Role with this name already exists')
  }

  // Create role
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .insert({
      name,
      description,
      is_system_role: false,
      created_by: createdBy,
    } as any)
    .select()
    .single()

  if (roleError || !role) {
    throw new Error(`Failed to create role: ${roleError?.message}`)
  }

  // Assign permissions
  if (permissionIds.length > 0) {
    const roleData = role as any
    const rolePermissions = permissionIds.map((permissionId) => ({
      role_id: roleData.id,
      permission_id: permissionId,
    }))

    const { error: permError } = await supabase
      .from('role_permissions')
      .insert(rolePermissions as any)

    if (permError) {
      // Rollback role creation
      const roleData = role as any
      await supabase.from('roles').delete().eq('id', roleData.id)
      throw new Error(`Failed to assign permissions: ${permError.message}`)
    }
  }

  return role
}

export async function updateRole(
  id: string,
  name: string,
  description: string | null,
  permissionIds: string[],
  allowSystemRoleUpdate: boolean = false
) {
  const supabase = createServiceClient()

  // Check if role is system role
  const { data: existingRole } = await supabase
    .from('roles')
    .select('is_system_role, name')
    .eq('id', id)
    .single()

  const isSystemRole = (existingRole as any)?.is_system_role

  // For system roles, only allow permission updates (not name/description changes)
  // unless explicitly allowed
  if (isSystemRole && !allowSystemRoleUpdate) {
    // Allow permission updates for system roles, but not name/description
    // Just update permissions without changing role name/description
    await supabase.from('role_permissions').delete().eq('role_id', id)

    if (permissionIds.length > 0) {
      const rolePermissions = permissionIds.map((permissionId) => ({
        role_id: id,
        permission_id: permissionId,
      }))

      const { error: permError } = await supabase
        .from('role_permissions')
        .insert(rolePermissions as any)

      if (permError) {
        throw new Error(`Failed to update permissions: ${permError.message}`)
      }
    }

    // Return the role without updating name/description
    return await getRoleById(id)
  }

  // For non-system roles or when explicitly allowed, update everything
  // Update role
  const updatePayload: any = {
    updated_at: new Date().toISOString(),
  }

  // Only update name and description if not a system role
  if (!isSystemRole) {
    updatePayload.name = name
    updatePayload.description = description
  }

  const { data: role, error: roleError } = await (supabase
    .from('roles') as any)
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (roleError || !role) {
    throw new Error(`Failed to update role: ${roleError?.message}`)
  }

  // Update permissions
  // Delete existing permissions
  await supabase.from('role_permissions').delete().eq('role_id', id)

  // Insert new permissions
  if (permissionIds.length > 0) {
    const rolePermissions = permissionIds.map((permissionId) => ({
      role_id: id,
      permission_id: permissionId,
    }))

    const { error: permError } = await supabase
      .from('role_permissions')
      .insert(rolePermissions as any)

    if (permError) {
      throw new Error(`Failed to update permissions: ${permError.message}`)
    }
  }

  return role
}

export async function deleteRole(id: string) {
  const supabase = createServiceClient()

  // Check if role is system role
  const { data: existingRole } = await supabase
    .from('roles')
    .select('is_system_role')
    .eq('id', id)
    .single()

  if ((existingRole as any)?.is_system_role) {
    throw new Error('Cannot delete system roles')
  }

  // Check if any users are using this role
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('role_id', id)
    .limit(1)

  if (users && users.length > 0) {
    throw new Error('Cannot delete role: Users are assigned to this role')
  }

  const { error } = await supabase.from('roles').delete().eq('id', id)

  if (error) {
    throw new Error(`Failed to delete role: ${error.message}`)
  }
}

export async function getAllPermissions() {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .order('resource', { ascending: true })
    .order('action', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch permissions: ${error.message}`)
  }

  return data
}
