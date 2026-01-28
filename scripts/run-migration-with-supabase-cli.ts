/**
 * Execute migration using Supabase client to verify and provide instructions
 * Since Supabase JS client doesn't support DDL, this will check status and provide manual steps
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { execSync } from 'child_process'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey || !supabaseUrl) {
  console.error('❌ Missing environment variables!')
  process.exit(1)
}

async function runMigration() {
  console.log('🚀 Running migration: Add languages_known column to users table\n')
  
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
    console.log('📝 Column does not exist. Need to add it.\n')
    
    // Try using Supabase CLI if available
    try {
      console.log('🔧 Attempting to use Supabase CLI...\n')
      
      // Check if supabase CLI is available
      try {
        execSync('which supabase', { stdio: 'ignore' })
        console.log('✓ Supabase CLI found\n')
        
        // Try to execute SQL using supabase CLI
        // Note: This requires the project to be linked or using direct connection
        console.log('📝 To run this migration with Supabase CLI, use:')
        console.log('   supabase db push\n')
        console.log('   Or connect and run:')
        console.log('   supabase db execute --file database/migrations/012_add_languages_known_to_users.sql\n')
        
      } catch (e) {
        console.log('⚠️  Supabase CLI not found in PATH\n')
      }
      
    } catch (error) {
      console.log('⚠️  Could not use Supabase CLI\n')
    }
    
    // Provide SQL and manual instructions
    const migrationSQL = `-- Add languages_known column to users table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'languages_known'
  ) THEN
    ALTER TABLE public.users ADD COLUMN languages_known TEXT[];
  END IF;
END $$;`
    
    console.log('📝 SQL to execute:')
    console.log('─'.repeat(60))
    console.log(migrationSQL)
    console.log('─'.repeat(60))
    console.log('\n🔗 Quick link to Supabase SQL Editor:')
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (projectRef) {
      console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
    }
    console.log('📋 Manual Steps:')
    console.log('   1. Open the link above')
    console.log('   2. Click "New query"')
    console.log('   3. Paste the SQL above')
    console.log('   4. Click "Run" (or press Cmd/Ctrl + Enter)')
    console.log('   5. Verify the column was added\n')
    
    // Try one more time with a direct API call using the service key
    console.log('🔄 Attempting direct API execution...\n')
    
    try {
      // Use the Supabase REST API to execute SQL
      // This might work if there's a custom function set up
      const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
      
      // Try the SQL editor API endpoint
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ sql: migrationSQL }),
      })
      
      if (response.ok) {
        console.log('✅ Migration executed successfully!\n')
        return
      }
      
      // If that doesn't work, the migration needs to be run manually
      console.log('⚠️  Automatic execution not available.')
      console.log('   The Supabase JS client and REST API do not support DDL operations.')
      console.log('   Please use the manual steps above.\n')
      
    } catch (error) {
      console.log('⚠️  API execution failed.')
      console.log('   Please use the manual steps above.\n')
    }
    
  } else {
    console.error('❌ Error:', checkError.message)
    process.exit(1)
  }
}

runMigration()
