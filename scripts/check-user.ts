/**
 * Script to check user status in database
 * 
 * Usage:
 * npx tsx scripts/check-user.ts <email>
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
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function checkUser() {
  const email = process.argv[2]

  if (!email) {
    console.error('❌ Missing email argument!')
    console.error('\nUsage:')
    console.error('  npx tsx scripts/check-user.ts <email>')
    process.exit(1)
  }

  console.log('🔍 Checking user status...')
  console.log(`   Email: ${email}\n`)

  try {
    // Get auth users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      throw new Error(`Failed to list users: ${authError.message}`)
    }

    const authUser = authUsers.users.find(u => u.email === email)
    
    if (!authUser) {
      console.log('❌ User not found in Supabase Auth')
      process.exit(1)
    }

    console.log('✓ Found in Supabase Auth:')
    console.log(`   ID: ${authUser.id}`)
    console.log(`   Email: ${authUser.email}`)
    console.log(`   Created: ${authUser.created_at}\n`)

    // Check in users table
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, email, name, role_id, roles!users_role_id_fkey(name)')
      .eq('id', authUser.id)
      .single()

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        console.log('❌ User NOT found in database (users table)')
        console.log('\n💡 To add this user to the database, run:')
        console.log(`   npx tsx scripts/add-user-to-db.ts ${email} "<name>" <role>`)
      } else {
        console.error('❌ Error checking database:', dbError.message)
      }
      process.exit(1)
    }

    if (dbUser) {
      console.log('✓ Found in database (users table):')
      console.log(`   ID: ${dbUser.id}`)
      console.log(`   Email: ${dbUser.email}`)
      console.log(`   Name: ${dbUser.name}`)
      console.log(`   Role ID: ${dbUser.role_id}`)
      
      const role = (dbUser as any).roles
      if (role) {
        const roleName = Array.isArray(role) ? role[0]?.name : role?.name
        console.log(`   Role: ${roleName || 'Unknown'}`)
      }
      
      console.log('\n✅ User is properly set up!')
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

checkUser()
