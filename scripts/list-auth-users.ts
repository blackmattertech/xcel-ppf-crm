/**
 * Script to list all Supabase Auth users
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

async function listUsers() {
  try {
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      throw new Error(`Failed to list users: ${authError.message}`)
    }

    console.log(`\n📋 Found ${authUsers.users.length} user(s) in Supabase Auth:\n`)

    for (const authUser of authUsers.users) {
      // Check if user exists in database
      const { data: dbUser } = await supabase
        .from('users')
        .select('id, name, role_id, roles!users_role_id_fkey(name)')
        .eq('id', authUser.id)
        .single()

      const role = dbUser ? ((dbUser as any).roles ? (Array.isArray((dbUser as any).roles) ? (dbUser as any).roles[0]?.name : (dbUser as any).roles?.name) : null) : null

      console.log(`Email: ${authUser.email}`)
      console.log(`  ID: ${authUser.id}`)
      console.log(`  In Database: ${dbUser ? '✅ Yes' : '❌ No'}`)
      if (dbUser) {
        console.log(`  Name: ${dbUser.name}`)
        console.log(`  Role: ${role || 'Unknown'}`)
      }
      console.log('')
    }

    // Check which user ID is in the error
    const errorUserId = '6016c04e-92e6-49c6-ac61-adc21c3c84c2'
    const errorUser = authUsers.users.find(u => u.id === errorUserId)
    
    if (errorUser) {
      console.log(`\n⚠️  The error showed user ID: ${errorUserId}`)
      console.log(`   This user's email: ${errorUser.email}`)
      console.log(`   This user is ${errorUser.email === 'xcelppf@gmail.com' ? 'the same' : 'DIFFERENT'} from xcelppf@gmail.com`)
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

listUsers()
