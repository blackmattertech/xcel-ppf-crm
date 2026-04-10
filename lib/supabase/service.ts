import { createClient } from '@supabase/supabase-js'
import { Database } from '@/shared/types/database'

/**
 * Creates a Supabase client with service role key (server-side only)
 * This function should ONLY be used in API routes and server components
 * NEVER import this in client components or 'use client' files
 */
export function createServiceClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL)')
  }
  if (!supabaseServiceKey) {
    throw new Error('Service role key is not configured')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
