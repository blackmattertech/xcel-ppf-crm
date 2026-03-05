import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type UserPushTokenRow = Database['public']['Tables']['user_push_tokens']['Row']
type UserPushTokenInsert = Database['public']['Tables']['user_push_tokens']['Insert']

/**
 * Upsert FCM token for a user. If the token already exists (e.g. from another user/device),
 * reassign it to the current user. One token = one device; one user can have many tokens.
 */
export async function upsertPushToken(
  userId: string,
  fcmToken: string,
  deviceLabel?: string | null
): Promise<UserPushTokenRow> {
  const supabase = createServiceClient()

  const payload: UserPushTokenInsert = {
    user_id: userId,
    fcm_token: fcmToken,
    device_label: deviceLabel ?? null,
    updated_at: new Date().toISOString(),
  }

  // Type assertion: Supabase client can infer 'never' for upsert when Database types are out of sync
  const { data, error } = await supabase
    .from('user_push_tokens')
    .upsert(payload as never, {
      onConflict: 'fcm_token',
      ignoreDuplicates: false,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to upsert push token: ${error.message}`)
  }

  return data as UserPushTokenRow
}

/**
 * Remove a single FCM token (e.g. on logout or "disable push").
 */
export async function deletePushToken(fcmToken: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('user_push_tokens')
    .delete()
    .eq('fcm_token', fcmToken)

  if (error) {
    throw new Error(`Failed to delete push token: ${error.message}`)
  }
}

/**
 * Remove all tokens for a user (e.g. on account logout from all devices).
 */
export async function deletePushTokensByUserId(userId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('user_push_tokens')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to delete push tokens for user: ${error.message}`)
  }
}

/**
 * Get all FCM tokens for a user (for sending push notifications).
 */
export async function getPushTokensByUserId(userId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_push_tokens')
    .select('fcm_token')
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to get push tokens: ${error.message}`)
  }

  const rows = (data || []) as Pick<UserPushTokenRow, 'fcm_token'>[]
  return rows.map((row) => row.fcm_token).filter(Boolean)
}
