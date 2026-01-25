/**
 * Script to add an existing Supabase Auth user to the users table
 * 
 * Usage:
 * npx tsx scripts/add-user-to-db.ts <email> <name> [role]
 * 
 * Examples:
 * npx tsx scripts/add-user-to-db.ts user@example.com "User Name" admin
 * npx tsx scripts/add-user-to-db.ts user@example.com "User Name" super_admin
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

async function addUserToDb() {
  const email = process.argv[2]
  const name = process.argv[3]
  const roleName = process.argv[4] || 'admin'

  if (!email || !name) {
    console.error('❌ Missing required arguments!')
    console.error('\nUsage:')
    console.error('  npx tsx scripts/add-user-to-db.ts <email> <name> [role]')
    console.error('\nExamples:')
    console.error('  npx tsx scripts/add-user-to-db.ts user@example.com "User Name" admin')
    console.error('  npx tsx scripts/add-user-to-db.ts user@example.com "User Name" super_admin')
    process.exit(1)
  }

  if (!['admin', 'super_admin', 'marketing', 'tele_caller'].includes(roleName)) {
    console.error('❌ Role must be one of: admin, super_admin, marketing, tele_caller')
    process.exit(1)
  }

  console.log('🚀 Adding user to database...')
  console.log(`   Email: ${email}`)
  console.log(`   Name: ${name}`)
  console.log(`   Role: ${roleName}\n`)

  try {
    // Get auth user by email
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      throw new Error(`Failed to list users: ${authError.message}`)
    }

    const authUser = authUsers.users.find(u => u.email === email)
    
    if (!authUser) {
      throw new Error(`User with email ${email} not found in Supabase Auth`)
    }

    console.log(`✓ Found auth user: ${authUser.id}`)

    // Check if user already exists in users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', authUser.id)
      .single()

    if (existingUser) {
      console.error(`❌ User already exists in database!`)
      console.error(`   User ID: ${existingUser.id}`)
      console.error(`   Email: ${existingUser.email}`)
      process.exit(1)
    }

    // Get role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name')
      .eq('name', roleName)
      .single()

    if (roleError || !role) {
      throw new Error(`Role "${roleName}" not found. Please run database migrations first.`)
    }

    console.log(`✓ Role "${roleName}" found (ID: ${role.id})`)

    // Create user record
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id: authUser.id,
        email: authUser.email || email,
        name,
        role_id: role.id,
      })
      .select()
      .single()

    if (userError) {
      throw new Error(`Failed to create user: ${userError.message}`)
    }

    console.log('✓ User record created')
    console.log('\n✅ User added to database successfully!')
    console.log(`\n📋 User details:`)
    console.log(`   ID: ${user.id}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Name: ${user.name}`)
    console.log(`   Role: ${roleName}`)
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

addUserToDb()
