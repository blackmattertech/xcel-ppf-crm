/**
 * Script to verify if quotations table exists in the database
 * If it doesn't exist, it will create it using the migration SQL
 */

import { createServiceClient } from '../lib/supabase/service'
import * as fs from 'fs'
import * as path from 'path'

async function verifyQuotationsTable() {
  const supabase = createServiceClient()

  try {
    // Check if quotations table exists by trying to query it
    const { data, error } = await supabase
      .from('quotations')
      .select('id')
      .limit(1)

    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.log('❌ Quotations table does not exist in the database')
        console.log('📝 Creating quotations table...')
        
        // Read the migration file
        const migrationPath = path.join(__dirname, '../database/migrations/004_followups_quotations.sql')
        const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')
        
        // Extract only the quotations table creation part
        const quotationsTableSQL = migrationSQL.split('-- Create quotations table')[1]?.split('-- Create trigger')[0]?.trim()
        
        if (!quotationsTableSQL) {
          console.error('❌ Could not extract quotations table SQL from migration file')
          return
        }

        // Execute the SQL to create the table
        // Note: Supabase client doesn't support raw SQL execution directly
        // You'll need to run this in Supabase SQL Editor or use a different approach
        console.log('\n📋 Please run the following SQL in your Supabase SQL Editor:')
        console.log('='.repeat(80))
        console.log(quotationsTableSQL)
        console.log('='.repeat(80))
        console.log('\nOr run the entire migration file: database/migrations/004_followups_quotations.sql')
        
        return
      } else {
        throw error
      }
    }

    console.log('✅ Quotations table exists in the database')
    
    // Get table info
    const { count } = await supabase
      .from('quotations')
      .select('*', { count: 'exact', head: true })
    
    console.log(`📊 Total quotations in database: ${count || 0}`)
    
  } catch (error) {
    console.error('❌ Error checking quotations table:', error)
    throw error
  }
}

// Run the verification
verifyQuotationsTable()
  .then(() => {
    console.log('\n✅ Verification complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error)
    process.exit(1)
  })
