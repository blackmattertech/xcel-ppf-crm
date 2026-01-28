/**
 * Script to run a database migration
 * 
 * Usage:
 * npx tsx scripts/run-migration.ts <migration-file-path>
 * 
 * Example:
 * npx tsx scripts/run-migration.ts database/migrations/012_add_languages_known_to_users.sql
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

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
  const migrationPath = process.argv[2]

  if (!migrationPath) {
    console.error('❌ Missing migration file path!')
    console.error('\nUsage:')
    console.error('  npx tsx scripts/run-migration.ts <migration-file-path>')
    console.error('\nExample:')
    console.error('  npx tsx scripts/run-migration.ts database/migrations/012_add_languages_known_to_users.sql')
    process.exit(1)
  }

  try {
    console.log(`🚀 Running migration: ${migrationPath}`)
    
    // Read the migration file
    const migrationSQL = readFileSync(resolve(process.cwd(), migrationPath), 'utf-8')
    
    console.log('\n📄 Migration SQL:')
    console.log('─'.repeat(50))
    console.log(migrationSQL)
    console.log('─'.repeat(50))
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL })
    
    if (error) {
      // If exec_sql doesn't exist, try direct query execution
      // Split by semicolons and execute each statement
      const statements = migrationSQL.split(';').filter(s => s.trim().length > 0)
      
      for (const statement of statements) {
        if (statement.trim()) {
          // Use Supabase's query method - this might not work for DDL, so we'll use a workaround
          // For DDL statements, we need to use the REST API or psql
          console.log(`\n⚠️  Direct SQL execution not available via Supabase client.`)
          console.log(`   Please run this migration manually in your Supabase SQL editor.`)
          console.log(`\n   Or use the Supabase CLI:`)
          console.log(`   supabase db push`)
          process.exit(1)
        }
      }
    } else {
      console.log('\n✅ Migration executed successfully!')
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    console.error('\n📝 Please run this migration manually:')
    console.error('   1. Go to your Supabase dashboard')
    console.error('   2. Navigate to SQL Editor')
    console.error('   3. Copy and paste the SQL from the migration file')
    console.error('   4. Execute the query')
    console.error('   5. Or use the Supabase CLI: supabase db push')
    process.exit(1)
  }
}

runMigration()
