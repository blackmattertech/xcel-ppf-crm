/**
 * Execute migration using direct PostgreSQL connection
 * This requires the pg library to be installed
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey || !supabaseUrl) {
  console.error('❌ Missing environment variables!')
  process.exit(1)
}

async function runMigration() {
  console.log('🚀 Running migration: Add languages_known column to users table\n')
  
  const migrationSQL = readFileSync(
    resolve(process.cwd(), 'database/migrations/012_add_languages_known_to_users.sql'),
    'utf-8'
  )
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  
  // Check if column exists
  const { error: checkError } = await supabase
    .from('users')
    .select('languages_known')
    .limit(1)
  
  if (!checkError) {
    console.log('✅ Column "languages_known" already exists!')
    console.log('   Migration has already been applied.\n')
    return
  }
  
  if (checkError.code === '42703') {
    console.log('📝 Column does not exist. Executing migration...\n')
    console.log('SQL to execute:')
    console.log('─'.repeat(60))
    console.log(migrationSQL.trim())
    console.log('─'.repeat(60))
    console.log('\n')
    
    // Since Supabase JS client doesn't support DDL, we need to use the SQL editor
    // But we can try to use the REST API with a different approach
    try {
      // Extract project reference
      const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
      
      if (!projectRef) {
        throw new Error('Could not extract project reference')
      }
      
      console.log('📡 Attempting to execute via Supabase API...\n')
      
      // Try using the Supabase SQL execution endpoint
      // Note: This may not work as Supabase restricts DDL operations
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ sql: migrationSQL.trim() }),
      })
      
      if (response.ok) {
        console.log('✅ Migration executed successfully!\n')
        return
      }
      
      const errorText = await response.text()
      console.log(`⚠️  API returned: ${response.status}`)
      console.log(`   ${errorText}\n`)
      
    } catch (error) {
      console.log('⚠️  API execution failed\n')
    }
    
    // Provide manual instructions
    console.log('📝 Please run this SQL manually in your Supabase SQL Editor:\n')
    console.log('─'.repeat(60))
    console.log(migrationSQL.trim())
    console.log('─'.repeat(60))
    console.log('\n🔗 Direct link:')
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (projectRef) {
      console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
    }
    console.log('💡 Tip: You can copy the SQL above and paste it directly into the SQL Editor.\n')
    
  } else {
    console.error('❌ Error:', checkError.message)
    process.exit(1)
  }
}

runMigration()
