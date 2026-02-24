/**
 * Run migration 015: Add ON DELETE SET NULL to user foreign keys
 * Fixes: "Unable to delete row as it is currently referenced by a foreign key constraint from the table leads"
 *
 * Run: npx tsx scripts/run-migration-015-user-fks.ts
 */

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey || !supabaseUrl) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sql = readFileSync(
  resolve(process.cwd(), 'database/migrations/015_user_delete_cascade_fks.sql'),
  'utf-8'
)

async function run() {
  const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
  if (!projectRef) {
    console.error('❌ Could not extract project ref from URL')
    process.exit(1)
  }

  console.log('🚀 Migration 015: Add ON DELETE SET NULL to user foreign keys\n')
  console.log('This fixes user deletion errors caused by leads/roles/quotations referencing the user.\n')

  try {
    const url = `https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ sql: sql.trim() }),
    })

    if (res.ok) {
      console.log('✅ Migration applied successfully!\n')
      return
    }
  } catch {
    /* fall through to manual instructions */
  }

  console.log('⚠️  Could not run automatically. Run this SQL in Supabase SQL Editor:\n')
  console.log('─'.repeat(60))
  console.log(sql.trim())
  console.log('─'.repeat(60))
  console.log('\n🔗 SQL Editor:')
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
}

run()
