'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<RoleInfo | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    let isMounted = true

    async function bootstrapAuth() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!isMounted) return

        if (!user) {
          setUserId(null)
          setRole(null)
          setProfile(null)
          return
        }

        setUserId(user.id)

        // Mirror the shape used in Sidebar & other components: users joined with roles + role_permissions.
        const { data: userData } = await supabase
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
          .eq('id', user.id)
          .single()

        if (!isMounted) return

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

            setRole({
              name: roleData.name ?? null,
              permissions,
            })
          } else {
            setRole(null)
          }
        } else {
          setRole(null)
          setProfile(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    // Run once on mount.
    bootstrapAuth()

    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Re-bootstrap whenever auth changes so switching accounts updates UI without refresh.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        bootstrapAuth()
      }
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [queryClient])

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

