/**
 * Script to assign permissions to a role
 * 
 * Usage:
 * npx tsx scripts/assign-permissions-to-role.ts <role-name> <permission-name>
 * 
 * Or assign all permissions to a role:
 * npx tsx scripts/assign-permissions-to-role.ts <role-name> --all
 * 
 * Examples:
 * npx tsx scripts/assign-permissions-to-role.ts admin roles.read
 * npx tsx scripts/assign-permissions-to-role.ts admin --all
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey || !supabaseUrl) {
  console.error('❌ Missing environment variables!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function assignPermissions() {
  const roleName = process.argv[2]
  const permissionName = process.argv[3]

  if (!roleName || !permissionName) {
    console.error('❌ Missing required arguments!')
    console.error('\nUsage:')
    console.error('  npx tsx scripts/assign-permissions-to-role.ts <role-name> <permission-name>')
    console.error('  npx tsx scripts/assign-permissions-to-role.ts <role-name> --all')
    console.error('\nExamples:')
    console.error('  npx tsx scripts/assign-permissions-to-role.ts admin roles.read')
    console.error('  npx tsx scripts/assign-permissions-to-role.ts admin --all')
    process.exit(1)
  }

  try {
    // Get role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name')
      .eq('name', roleName)
      .single()

    if (roleError || !role) {
      throw new Error(`Role "${roleName}" not found`)
    }

    console.log(`✓ Found role: ${roleName} (ID: ${role.id})\n`)

    if (permissionName === '--all') {
      // Get all permissions
      const { data: allPermissions, error: permError } = await supabase
        .from('permissions')
        .select('id, name')

      if (permError || !allPermissions) {
        throw new Error(`Failed to fetch permissions: ${permError?.message}`)
      }

      console.log(`📋 Found ${allPermissions.length} permissions\n`)

      // Check existing permissions
      const { data: existing } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', role.id)

      const existingIds = new Set(existing?.map(rp => rp.permission_id) || [])
      const newPermissions = allPermissions.filter(p => !existingIds.has(p.id))

      if (newPermissions.length === 0) {
        console.log('✅ Role already has all permissions assigned!')
        process.exit(0)
      }

      // Assign all permissions
      const rolePermissions = newPermissions.map(perm => ({
        role_id: role.id,
        permission_id: perm.id,
      }))

      const { error: assignError } = await supabase
        .from('role_permissions')
        .insert(rolePermissions)

      if (assignError) {
        throw new Error(`Failed to assign permissions: ${assignError.message}`)
      }

      console.log(`✅ Assigned ${newPermissions.length} permissions to role "${roleName}"`)
      console.log(`\n📋 Permissions assigned:`)
      newPermissions.forEach(p => console.log(`   - ${p.name}`))
    } else {
      // Get specific permission
      const { data: permission, error: permError } = await supabase
        .from('permissions')
        .select('id, name')
        .eq('name', permissionName)
        .single()

      if (permError || !permission) {
        throw new Error(`Permission "${permissionName}" not found`)
      }

      // Check if already assigned
      const { data: existing } = await supabase
        .from('role_permissions')
        .select('id')
        .eq('role_id', role.id)
        .eq('permission_id', permission.id)
        .single()

      if (existing) {
        console.log(`✅ Permission "${permissionName}" is already assigned to role "${roleName}"`)
        process.exit(0)
      }

      // Assign permission
      const { error: assignError } = await supabase
        .from('role_permissions')
        .insert({
          role_id: role.id,
          permission_id: permission.id,
        })

      if (assignError) {
        throw new Error(`Failed to assign permission: ${assignError.message}`)
      }

      console.log(`✅ Assigned permission "${permissionName}" to role "${roleName}"`)
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

assignPermissions()
