/**
 * Script to run migration 012: Add languages_known to users table
 * 
 * This script will check if the column exists and add it if needed.
 * If automatic execution fails, it will provide instructions for manual execution.
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

async function runMigration() {
  try {
    console.log('🚀 Running migration: Add languages_known column to users table\n')
    
    // Check if column already exists by trying to query it
    const { error: checkError } = await supabase
      .from('users')
      .select('languages_known')
      .limit(1)
    
    if (!checkError) {
      console.log('✅ Column "languages_known" already exists!')
      console.log('   Migration has already been applied.\n')
      return
    }
    
    // If we get here, the column doesn't exist
    if (checkError.code === '42703' || checkError.message.includes('column') && checkError.message.includes('does not exist')) {
      console.log('📝 Column does not exist. Attempting to add it...\n')
      
      // Try to execute the migration using Supabase's SQL execution
      // Since Supabase JS client doesn't support DDL, we'll use a workaround
      // by creating a function that executes the SQL
      
      const migrationSQL = `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'languages_known'
          ) THEN
            ALTER TABLE public.users ADD COLUMN languages_known TEXT[];
          END IF;
        END $$;
      `
      
      // Try executing via REST API
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ sql: migrationSQL }),
        })
        
        const responseText = await response.text()
        
        if (response.ok || response.status === 200 || response.status === 201) {
          console.log('✅ Migration executed successfully via REST API!\n')
          
          // Verify
          const { error: verifyError } = await supabase
            .from('users')
            .select('languages_known')
            .limit(1)
          
          if (!verifyError) {
            console.log('✅ Verification: Column exists and is accessible!')
          } else {
            console.log('⚠️  Verification: Please check manually in Supabase dashboard')
          }
          return
        } else {
          console.log(`⚠️  REST API returned status ${response.status}`)
          console.log(`   Response: ${responseText}\n`)
        }
      } catch (fetchError) {
        console.log('⚠️  REST API method failed:', fetchError instanceof Error ? fetchError.message : fetchError)
        console.log('')
      }
      
      // If REST API fails, provide manual instructions
      console.log('📝 Automatic execution not available.')
      console.log('   Please run this SQL manually in your Supabase SQL Editor:\n')
      console.log('─'.repeat(60))
      console.log(migrationSQL.trim())
      console.log('─'.repeat(60))
      console.log('\n🔗 Steps to run manually:')
      console.log('   1. Go to your Supabase dashboard')
      console.log('   2. Navigate to SQL Editor')
      console.log('   3. Create a new query')
      console.log('   4. Copy and paste the SQL above')
      console.log('   5. Click "Run" to execute\n')
      
      // Extract project ID from URL for direct link
      const projectMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)
      if (projectMatch) {
        const projectRef = projectMatch[1]
        console.log(`   Direct link: https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
      }
      
    } else {
      console.error('❌ Unexpected error checking column:', checkError.message)
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

runMigration()
