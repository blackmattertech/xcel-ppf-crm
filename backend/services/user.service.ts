import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'
import { reassignLeadsFromDeletedUser } from '@/backend/services/assignment.service'

type User = Database['public']['Tables']['users']['Row']

export async function getAllUsers() {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  // Transform the data to match expected format (roles might be array or single)
  return (data || []).map((user: any) => ({
    ...user,
    role: Array.isArray(user.roles) ? user.roles[0] : user.roles,
  }))
}

export async function getUserById(id: string) {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(`Failed to fetch user: ${error.message}`)
  }

  // Transform the data to match expected format
  const userData = data as any
  return {
    ...userData,
    role: Array.isArray(userData.roles) ? userData.roles[0] : userData.roles,
  }
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  phone: string | null,
  roleId: string,
  branchId: string | null,
  profileImageUrl?: string | null,
  address?: string | null,
  dob?: string | null,
  doj?: string | null
) {
  const supabase = createServiceClient()

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`)
  }

  // Create user record
  const { data: user, error: userError } = await supabase
    .from('users')
    // @ts-ignore - Supabase type inference issue with dynamic inserts
    .insert({
      id: authData.user.id,
      email,
      name,
      phone,
      role_id: roleId,
      branch_id: branchId,
      profile_image_url: profileImageUrl || null,
      address: address || null,
      dob: dob || null,
      doj: doj || null,
    } as any)
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .single()

  if (userError) {
    // Clean up auth user if user creation fails
    await supabase.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Failed to create user: ${userError.message}`)
  }

  // Transform the data to match expected format
  const userData = user as any
  return {
    ...userData,
    role: Array.isArray(userData.roles) ? userData.roles[0] : userData.roles,
  }
}

export async function updateUser(
  id: string,
  name: string,
  phone: string | null,
  roleId: string,
  branchId: string | null,
  profileImageUrl?: string | null,
  address?: string | null,
  dob?: string | null,
  doj?: string | null,
  languagesKnown?: string[] | null
) {
  const supabase = createServiceClient()

  const updateData: any = {
    name,
    phone,
    role_id: roleId,
    branch_id: branchId,
    updated_at: new Date().toISOString(),
  }

  // Only update fields that are provided
  if (profileImageUrl !== undefined) {
    updateData.profile_image_url = profileImageUrl
  }
  if (address !== undefined) {
    updateData.address = address
  }
  if (dob !== undefined) {
    updateData.dob = dob
  }
  if (doj !== undefined) {
    updateData.doj = doj
  }
  if (languagesKnown !== undefined) {
    updateData.languages_known = languagesKnown
  }

  const { data, error } = await supabase
    .from('users')
    // @ts-ignore - Supabase type inference issue with dynamic updates
    .update(updateData)
    .eq('id', id)
    .select(`
      *,
      roles!users_role_id_fkey (*)
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update user: ${error.message}`)
  }

  // Transform the data to match expected format
  const userData = data as any
  return {
    ...userData,
    role: Array.isArray(userData.roles) ? userData.roles[0] : userData.roles,
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function checkError(result: { error?: { message: string } | null }, context: string) {
  if (result?.error) {
    throw new Error(`${context}: ${result.error.message}`)
  }
}

/**
 * Clear or reassign all records that reference the user before deletion.
 * Required to avoid foreign key constraint errors when deleting from auth.users.
 */
async function clearUserReferences(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  reassignToUserId: string | null
) {
  const db = supabase as any

  // 1. Reassign leads to other users (round-robin among tele_callers, or to admin)
  await reassignLeadsFromDeletedUser(userId, reassignToUserId)
  // Fallback: unassign any remaining leads (e.g. when no other users exist)
  checkError(
    await db.from('leads').update({ assigned_to: null }).eq('assigned_to', userId),
    'leads.assigned_to'
  )

  // 2. Delete follow-ups (user can't complete them after removal)
  checkError(
    await db.from('follow_ups').delete().eq('assigned_to', userId),
    'follow_ups'
  )

  // 3. Reassign or delete lead_status_history (audit trail)
  if (reassignToUserId) {
    checkError(
      await db.from('lead_status_history').update({ changed_by: reassignToUserId }).eq('changed_by', userId),
      'lead_status_history.changed_by'
    )
  } else {
    checkError(
      await db.from('lead_status_history').delete().eq('changed_by', userId),
      'lead_status_history'
    )
  }

  // 4. Reassign or delete calls
  if (reassignToUserId) {
    checkError(
      await db.from('calls').update({ called_by: reassignToUserId }).eq('called_by', userId),
      'calls.called_by'
    )
  } else {
    checkError(
      await db.from('calls').delete().eq('called_by', userId),
      'calls'
    )
  }

  // 5. Reassign quotations (created_by is NOT NULL - need another user)
  const reassignId = reassignToUserId
  if (reassignId && reassignId !== userId) {
    checkError(
      await db.from('quotations').update({ created_by: reassignId }).eq('created_by', userId),
      'quotations.created_by'
    )
  } else {
    const { data: other, error: otherErr } = await db.from('users').select('id').neq('id', userId).limit(1).maybeSingle()
    checkError({ error: otherErr }, 'users (fallback)')
    if (other) {
      checkError(
        await db.from('quotations').update({ created_by: other.id }).eq('created_by', userId),
        'quotations.created_by'
      )
    }
  }

  // 5b. Clear quotations.rejected_by (nullable, from migration 011 - may not exist)
  const rq = await db.from('quotations').update({ rejected_by: null }).eq('rejected_by', userId)
  if (rq?.error && !rq.error.message?.toLowerCase().includes('column') && !rq.error.message?.toLowerCase().includes('exist')) {
    checkError(rq, 'quotations.rejected_by')
  }

  // 6. Clear roles.created_by (nullable)
  checkError(
    await db.from('roles').update({ created_by: null }).eq('created_by', userId),
    'roles.created_by'
  )

  // 7. Assignments have ON DELETE CASCADE - will auto-delete when user is removed
  // 8. Optional tables - ignore if they don't exist
  const optionalTables = [
    ['facebook_business_settings', 'created_by'],
    ['products', 'created_by'],
    ['lead_activities', 'performed_by'],
  ] as const
  for (const [table, col] of optionalTables) {
    const r = await db.from(table).update({ [col]: null }).eq(col, userId)
    const msg = r?.error?.message?.toLowerCase() ?? ''
    const isMissing = msg.includes('does not exist') || msg.includes('column') || msg.includes('relation')
    if (r?.error && !isMissing) {
      checkError(r, `${table}.${col}`)
    }
  }
}

export async function deleteUser(
  id: string,
  /** User ID to reassign records to (e.g. the admin performing the delete). Used for NOT NULL columns. */
  reassignToUserId?: string | null
) {
  const supabase = createServiceClient()

  const trimmedId = typeof id === 'string' ? id.trim() : String(id)
  const normalizedId = trimmedId.toLowerCase()

  if (!UUID_REGEX.test(normalizedId)) {
    throw new Error(`Invalid user ID format: expected UUID, got "${trimmedId}"`)
  }

  // Clear all dependent records before auth delete (avoids FK constraint errors)
  await clearUserReferences(supabase, normalizedId, reassignToUserId ?? null)

  // Delete auth user (cascades to public.users)
  const { error } = await supabase.auth.admin.deleteUser(normalizedId)

  if (error) {
    const hint = /foreign key|constraint|violates/i.test(error.message || '')
      ? ' (Some table may still reference this user.)'
      : ''
    throw new Error(`Failed to delete user: ${error.message}${hint}`)
  }
}
