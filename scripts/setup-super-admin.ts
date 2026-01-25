/**
 * Script to create initial super admin user
 * 
 * Usage:
 * 1. Set SUPABASE_SERVICE_ROLE_KEY in your environment
 * 2. Run: npx tsx scripts/setup-super-admin.ts
 * 
 * Or use this as a reference to create the super admin via Supabase dashboard
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function createSuperAdmin() {
  const email = process.argv[2] || 'info@blackmattertech.com '
  const password = process.argv[3] || 'Black@2025'
  const name = process.argv[4] || 'Super Admin'

  console.log('Creating super admin user...')
  console.log(`Email: ${email}`)
  console.log(`Name: ${name}`)

  try {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user: ${authError?.message}`)
    }

    console.log('✓ Auth user created')

    // Get super_admin role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'super_admin')
      .single()

    if (roleError || !role) {
      throw new Error('Super admin role not found. Please run migrations first.')
    }

    console.log('✓ Super admin role found')

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

    console.log('✓ User record created')
    console.log('\n✅ Super admin created successfully!')
    console.log(`\nYou can now login with:`)
    console.log(`Email: ${email}`)
    console.log(`Password: ${password}`)
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

createSuperAdmin()
