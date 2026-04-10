/**
 * Script to create initial admin/super admin users
 * 
 * Usage:
 * npx tsx scripts/create-admin.ts <email> <password> <name> [role]
 * 
 * Examples:
 * npx tsx scripts/create-admin.ts admin@xcel.com Admin123 "Admin User" admin
 * npx tsx scripts/create-admin.ts superadmin@xcel.com Super123 "Super Admin" super_admin
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey || !supabaseUrl) {
  console.error('❌ Missing environment variables!')
  console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function createAdmin() {
  const email = process.argv[2]
  const password = process.argv[3]
  const name = process.argv[4]
  const roleName = process.argv[5] || 'admin'

  if (!email || !password || !name) {
    console.error('❌ Missing required arguments!')
    console.error('\nUsage:')
    console.error('  npx tsx scripts/create-admin.ts <email> <password> <name> [role]')
    console.error('\nExamples:')
    console.error('  npx tsx scripts/create-admin.ts admin@xcel.com Admin123 "Admin User" admin')
    console.error('  npx tsx scripts/create-admin.ts super@xcel.com Super123 "Super Admin" super_admin')
    process.exit(1)
  }

  if (!['admin', 'super_admin'].includes(roleName)) {
    console.error('❌ Role must be either "admin" or "super_admin"')
    process.exit(1)
  }

  console.log('🚀 Creating admin user...')
  console.log(`   Email: ${email}`)
  console.log(`   Name: ${name}`)
  console.log(`   Role: ${roleName}\n`)

  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()

    if (existingUser) {
      console.error(`❌ User with email ${email} already exists!`)
      process.exit(1)
    }

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

    // Get role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name')
      .eq('name', roleName)
      .single()

    if (roleError || !role) {
      throw new Error(`Role "${roleName}" not found. Please run database migrations first.`)
    }

    console.log(`✓ Role "${roleName}" found`)

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
    console.log('\n✅ Admin user created successfully!')
    console.log(`\n📋 Login credentials:`)
    console.log(`   Email: ${email}`)
    console.log(`   Password: ${password}`)
    const loginBase =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || 'http://localhost:3000'
    console.log(`\n🔗 Login at: ${loginBase}/login`)
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

createAdmin()
