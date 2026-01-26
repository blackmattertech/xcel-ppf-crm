/**
 * Verify that the migration was applied successfully
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function verifyMigration() {
  console.log('🔍 Verifying migration: languages_known column\n')
  
  try {
    // Try to query the column
    const { data, error } = await supabase
      .from('users')
      .select('id, name, languages_known')
      .limit(1)
    
    if (error) {
      if (error.code === '42703') {
        console.log('❌ Column "languages_known" does not exist yet.')
        console.log('   Migration may not have been applied.\n')
        process.exit(1)
      } else {
        console.error('❌ Error:', error.message)
        process.exit(1)
      }
    } else {
      console.log('✅ Migration verified successfully!')
      console.log('   Column "languages_known" exists and is accessible.\n')
      console.log('📊 Sample data:')
      if (data && data.length > 0) {
        console.log(`   User: ${data[0].name}`)
        console.log(`   Languages: ${data[0].languages_known || '[]'}\n`)
      }
    }
  } catch (error) {
    console.error('❌ Verification failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

verifyMigration()
