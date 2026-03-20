import { createClient } from '@supabase/supabase-js'

/**
 * Optional second Supabase project (e.g. another database for customers).
 * Only use in API routes / server code.
 *
 * Set in .env.local:
 * - SUPABASE_EXT_URL: External project URL
 * - SUPABASE_EXT_SERVICE_ROLE_KEY: External project service role key
 * - SUPABASE_EXT_CUSTOMERS_TABLE: Table name for customers (default: "customers")
 *
 * Returns null if env is not configured.
 */
export function createExternalServiceClient() {
  const url = process.env.SUPABASE_EXT_URL
  const key = process.env.SUPABASE_EXT_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function getExternalCustomersTable(): string {
  return process.env.SUPABASE_EXT_CUSTOMERS_TABLE || 'customers'
}
