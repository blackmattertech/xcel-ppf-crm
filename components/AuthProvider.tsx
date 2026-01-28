'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type RoleInfo = {
  name: string | null
  permissions: string[]
}

type UserProfile = {
  name: string
  email: string
  profileImageUrl: string | null
}

type AuthContextValue = {
  loading: boolean
  /** Raw Supabase auth user id, or null when signed out */
  userId: string | null
  /** Convenient flag for “authenticated user exists” */
  isAuthenticated: boolean
  /** Role name from the joined roles table, if any */
  role: RoleInfo | null
  /** Basic profile fields used across the UI (sidebar, headers, etc.) */
  profile: UserProfile | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Centralised client-side auth bootstrap.
 *
 * IMPORTANT: This does not change any business logic or redirect behaviour by itself.
 * Consumers decide what to do with loading / auth state; this only avoids duplicate
 * Supabase calls and keeps role/permission data consistent.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<RoleInfo | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    let isMounted = true
    let isBootstrapped = false
    const supabase = createClient()

    async function loadUserData(userId: string) {
      try {
        // Mirror the shape used in Sidebar & other components: users joined with roles + role_permissions.
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select(
            `
          id,
          name,
          email,
          profile_image_url,
          roles!users_role_id_fkey (
            name,
            role_permissions (
              permissions (
                name
              )
            )
          )
        `
          )
          .eq('id', userId)
          .single()

        if (!isMounted) return

        if (userError) {
          console.error('Error fetching user data:', userError)
          setRole(null)
          setProfile(null)
          return
        }

        if (userData) {
          const u: any = userData
          setProfile({
            name: u.name || '',
            email: u.email || '',
            profileImageUrl:
              u.profile_image_url && typeof u.profile_image_url === 'string' && u.profile_image_url.trim() !== ''
                ? u.profile_image_url
                : null,
          })
          const roleData = Array.isArray(u.roles) ? u.roles[0] : u.roles

          if (roleData) {
            const permissions =
              (roleData.role_permissions || [])
                .map((rp: any) => rp.permissions?.name)
                .filter(Boolean) ?? []

            console.log('Loaded permissions:', permissions)
            console.log('Loaded role:', roleData.name)

            setRole({
              name: roleData.name ?? null,
              permissions,
            })
          } else {
            console.warn('No role data found for user')
            setRole(null)
          }
        } else {
          console.warn('No user data returned')
          setRole(null)
          setProfile(null)
        }
      } catch (error) {
        console.error('Exception loading user data:', error)
        if (isMounted) {
          setRole(null)
          setProfile(null)
        }
      }
    }

    async function bootstrapAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!isMounted) return

        if (!user) {
          setUserId(null)
          setRole(null)
          setProfile(null)
          setLoading(false)
          return
        }

        setUserId(user.id)
        await loadUserData(user.id)
      } finally {
        if (isMounted) {
          setLoading(false)
          isBootstrapped = true
        }
      }
    }

    // Run once on mount
    bootstrapAuth()

    // Listen for auth state changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      console.log('Auth state changed:', event, session?.user?.id)

      // Skip INITIAL_SESSION and SIGNED_IN during bootstrap to avoid duplicate loading
      if (!isBootstrapped && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        console.log('Skipping event during bootstrap:', event)
        return
      }

      try {
        if (event === 'SIGNED_IN' && session?.user) {
          // User just logged in (after bootstrap) - reload their data
          console.log('User logged in, loading data...')
          setUserId(session.user.id)
          await loadUserData(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          // User logged out - clear everything
          console.log('User logged out, clearing data...')
          setUserId(null)
          setRole(null)
          setProfile(null)
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Token refreshed - make sure we have latest data (don't show loading for this)
          console.log('Token refreshed, reloading data...')
          setUserId(session.user.id)
          await loadUserData(session.user.id)
        } else if (event === 'USER_UPDATED' && session?.user) {
          // User data updated - reload
          console.log('User updated, reloading data...')
          setUserId(session.user.id)
          await loadUserData(session.user.id)
        }
      } catch (error) {
        console.error('Error in auth state change handler:', error)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      userId,
      isAuthenticated: !!userId,
      role,
      profile,
    }),
    [loading, userId, role, profile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }
  return ctx
}

