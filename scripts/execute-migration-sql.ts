/**
 * Execute migration SQL directly using Supabase connection
 * This script uses the service role key to execute DDL statements
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

async function executeMigration() {
  console.log('🚀 Executing migration: Add languages_known column\n')
  
  // The SQL to execute
  const sql = `
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
  
  try {
    // Use Supabase Management API or direct connection
    // Since Supabase JS client doesn't support DDL, we'll use fetch to the SQL endpoint
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
    
    if (!projectRef) {
      throw new Error('Could not extract project reference from URL')
    }
    
    // Try Supabase Management API endpoint for SQL execution
    const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
    
    console.log('📡 Attempting to execute via Supabase Management API...\n')
    
    const response = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        query: sql.trim(),
      }),
    })
    
    if (response.ok) {
      const result = await response.json()
      console.log('✅ Migration executed successfully!\n')
      console.log('Result:', result)
      return
    }
    
    // If Management API doesn't work, try the SQL editor endpoint
    console.log('⚠️  Management API method failed, trying SQL editor endpoint...\n')
    
    const sqlEditorUrl = `${supabaseUrl}/rest/v1/rpc/exec_sql`
    const sqlResponse = await fetch(sqlEditorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ sql: sql.trim() }),
    })
    
    if (sqlResponse.ok) {
      console.log('✅ Migration executed successfully via SQL editor endpoint!\n')
      return
    }
    
    // Last resort: provide manual instructions
    throw new Error('Automatic execution not available')
    
  } catch (error) {
    console.log('⚠️  Could not execute migration automatically.\n')
    console.log('📝 Please run this SQL manually in your Supabase SQL Editor:\n')
    console.log('─'.repeat(60))
    console.log(sql.trim())
    console.log('─'.repeat(60))
    console.log('\n🔗 Quick link to SQL Editor:')
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (projectRef) {
      console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
    }
    console.log('📋 Steps:')
    console.log('   1. Click the link above (or go to Supabase Dashboard > SQL Editor)')
    console.log('   2. Click "New query"')
    console.log('   3. Paste the SQL above')
    console.log('   4. Click "Run" (or press Cmd/Ctrl + Enter)\n')
  }
}

executeMigration()
