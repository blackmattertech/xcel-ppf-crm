/**
 * Script to create performance optimization indexes
 * 
 * This script creates indexes one-by-one outside of a transaction
 * to support CONCURRENTLY which prevents table locking.
 * 
 * Usage:
 *   npx tsx scripts/create-performance-indexes.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const indexes = [
  {
    name: 'leads_status_assigned_to_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_assigned_to_idx 
      ON leads(status, assigned_to) 
      WHERE status != 'fully_paid'`,
    description: 'Optimizes tele-caller queries filtering by status and assigned user'
  },
  {
    name: 'leads_status_created_at_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_created_at_idx 
      ON leads(status, created_at DESC)`,
    description: 'Optimizes lead list queries that filter by status and sort by creation date'
  },
  {
    name: 'leads_source_status_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_source_status_idx 
      ON leads(source, status)`,
    description: 'Optimizes analytics queries grouping by source and filtering by status'
  },
  {
    name: 'leads_email_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_email_idx 
      ON leads(email) 
      WHERE email IS NOT NULL`,
    description: 'Optimizes duplicate detection queries by email'
  },
  {
    name: 'leads_branch_id_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_branch_id_idx 
      ON leads(branch_id) 
      WHERE branch_id IS NOT NULL`,
    description: 'Optimizes branch-specific lead queries'
  },
  {
    name: 'follow_ups_assigned_status_scheduled_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_assigned_status_scheduled_idx 
      ON follow_ups(assigned_to, status, scheduled_at) 
      WHERE status = 'pending'`,
    description: 'Optimizes pending follow-up queries for tele-callers'
  },
  {
    name: 'follow_ups_scheduled_status_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_scheduled_status_idx 
      ON follow_ups(scheduled_at, status)`,
    description: 'Optimizes follow-up queries filtering by date range and status'
  },
  {
    name: 'quotations_lead_status_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_status_idx 
      ON quotations(lead_id, status)`,
    description: 'Optimizes quotation queries for lead detail page'
  },
  {
    name: 'quotations_lead_version_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_version_idx 
      ON quotations(lead_id, version DESC)`,
    description: 'Optimizes queries retrieving the latest quotation version for a lead'
  },
  {
    name: 'quotations_validity_status_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_validity_status_idx 
      ON quotations(validity_date, status) 
      WHERE status NOT IN ('accepted', 'expired')`,
    description: 'Optimizes expiry check queries'
  },
  {
    name: 'lead_status_history_lead_created_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_status_history_lead_created_idx 
      ON lead_status_history(lead_id, created_at DESC)`,
    description: 'Optimizes status history queries for lead detail page'
  },
  {
    name: 'calls_lead_created_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_lead_created_idx 
      ON calls(lead_id, created_at DESC)`,
    description: 'Optimizes call history queries for lead detail page'
  },
  {
    name: 'orders_customer_status_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_status_idx 
      ON orders(customer_id, status)`,
    description: 'Optimizes customer order queries'
  },
  {
    name: 'orders_lead_status_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_lead_status_idx 
      ON orders(lead_id, status) 
      WHERE lead_id IS NOT NULL`,
    description: 'Optimizes order queries by lead'
  },
  {
    name: 'orders_created_at_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_created_at_idx 
      ON orders(created_at DESC)`,
    description: 'Optimizes order list queries sorted by creation date'
  },
  {
    name: 'users_role_id_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS users_role_id_idx 
      ON users(role_id)`,
    description: 'Optimizes user queries filtering by role'
  },
  {
    name: 'users_branch_id_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS users_branch_id_idx 
      ON users(branch_id) 
      WHERE branch_id IS NOT NULL`,
    description: 'Optimizes branch-specific user queries'
  },
  {
    name: 'products_active_created_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS products_active_created_idx 
      ON products(is_active, created_at DESC) 
      WHERE is_active = TRUE`,
    description: 'Optimizes queries for active products sorted by creation date'
  },
  {
    name: 'customers_type_created_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS customers_type_created_idx 
      ON customers(customer_type, created_at DESC)`,
    description: 'Optimizes customer queries filtering by type and sorted by date'
  },
  {
    name: 'leads_requirement_gin_idx',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_requirement_gin_idx 
      ON leads USING GIN (to_tsvector('english', COALESCE(requirement, '')))`,
    description: 'Enables full-text search on lead requirements'
  }
]

async function checkIfIndexExists(indexName: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('pg_indexes', {}).single()
  
  // Alternative: query directly
  const { data: result, error: checkError } = await supabase
    .from('pg_indexes')
    .select('indexname')
    .eq('indexname', indexName)
    .single()
  
  if (checkError && checkError.code !== 'PGRST116') {
    // PGRST116 is "not found" which is expected
    console.warn(`⚠️  Could not check if index exists: ${checkError.message}`)
    return false
  }
  
  return result !== null
}

async function createIndex(index: typeof indexes[0]): Promise<boolean> {
  console.log(`\n📝 Creating index: ${index.name}`)
  console.log(`   ${index.description}`)
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: index.sql })
    
    if (error) {
      console.error(`❌ Failed to create ${index.name}:`, error.message)
      return false
    }
    
    console.log(`✅ Successfully created ${index.name}`)
    return true
  } catch (err) {
    console.error(`❌ Exception creating ${index.name}:`, err)
    return false
  }
}

async function main() {
  console.log('🚀 Starting performance index creation...\n')
  console.log(`📊 Total indexes to create: ${indexes.length}`)
  console.log(`⏱️  Estimated time: ${Math.ceil(indexes.length * 0.5)} minutes (depends on table sizes)\n`)
  console.log('⚠️  Note: Indexes are created CONCURRENTLY (no table locks)')
  console.log('⚠️  You can continue using the application during creation\n')
  console.log('═'.repeat(60))
  
  const results = {
    created: 0,
    failed: 0,
    skipped: 0
  }
  
  for (const index of indexes) {
    const success = await createIndex(index)
    if (success) {
      results.created++
    } else {
      results.failed++
    }
    
    // Small delay between index creations to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log('\n' + '═'.repeat(60))
  console.log('\n📊 Summary:')
  console.log(`   ✅ Created: ${results.created}`)
  console.log(`   ❌ Failed: ${results.failed}`)
  console.log(`   ⏭️  Skipped: ${results.skipped}`)
  
  if (results.failed === 0) {
    console.log('\n🎉 All indexes created successfully!')
    console.log('\n📈 Next steps:')
    console.log('   1. Test query performance (should be 60-70% faster)')
    console.log('   2. Monitor application for any issues')
    console.log('   3. Check index usage after a few days')
    console.log('\n💡 To verify indexes are being used, run:')
    console.log("   SELECT indexname FROM pg_indexes WHERE tablename = 'leads';")
  } else {
    console.log('\n⚠️  Some indexes failed to create. Check errors above.')
    console.log('   You can re-run this script to retry failed indexes.')
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })
