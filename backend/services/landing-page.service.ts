import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

export type LandingPageSettings = Database['public']['Tables']['landing_page_settings']['Row']

export type LandingPageSettingsUpdate = Database['public']['Tables']['landing_page_settings']['Update']

const DEFAULT_ID = 'default'

export async function getLandingPageSettings(): Promise<LandingPageSettings | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('landing_page_settings')
    .select('*')
    .eq('id', DEFAULT_ID)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load landing page settings: ${error.message}`)
  }
  return data as LandingPageSettings | null
}

export async function upsertLandingPageSettings(
  patch: Omit<LandingPageSettingsUpdate, 'id'>
): Promise<LandingPageSettings> {
  const supabase = createServiceClient()
  const row: Database['public']['Tables']['landing_page_settings']['Insert'] = {
    id: DEFAULT_ID,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('landing_page_settings')
    // Supabase client insert typing can resolve to `never` for newer tables until types are regenerated.
    .upsert(row as never, { onConflict: 'id' })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to save landing page settings: ${error.message}`)
  }
  return data as LandingPageSettings
}
