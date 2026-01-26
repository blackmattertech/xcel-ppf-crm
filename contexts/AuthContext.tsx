'use client'

import { createContext, useContext, ReactNode, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface UserData {
  id: string
  name: string
  email: string
  role: string | null
  permissions: string[]
}

interface AuthContextType {
  user: UserData | null
  isLoading: boolean
  isAuthenticated: boolean
  refetch: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Fetch user data with role and permissions
async function fetchUserData() {
  const supabase = createClient()
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !authUser) {
    return null
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select(`
      id,
      name,
      email,
      role_id,
      roles!users_role_id_fkey (
        name,
        role_permissions (
          permissions (
            name
          )
        )
      )
    `)
    .eq('id', authUser.id)
    .single()

  if (userError || !userData) {
    return null
  }

  // Type assertion for the user data structure
  type UserDataWithRole = {
    id: string
    name: string
    email: string | null
    roles: {
      name: string
      role_permissions: Array<{
        permissions: {
          name: string
        } | null
      }>
    } | null
  } | null

  const typedUserData = userData as UserDataWithRole
  
  if (!typedUserData) {
    return null
  }

  const roleData = typedUserData.roles
  const roleName = roleData?.name || null
  
  // Extract permissions from role_permissions
  const permissions = (roleData?.role_permissions || [])
    .map((rp) => rp.permissions?.name)
    .filter(Boolean) as string[]

  return {
    id: typedUserData.id,
    name: typedUserData.name,
    email: typedUserData.email || authUser.email || '',
    role: roleName,
    permissions,
  } as UserData
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data: user, isLoading, refetch, error } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: fetchUserData,
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
    refetchOnMount: false, // Don't refetch on every mount to prevent loops
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent loops
    refetchOnReconnect: true, // Only refetch on reconnect
  })

  // Log errors for debugging
  useEffect(() => {
    if (error) {
      console.error('Auth query error:', error)
    }
  }, [error])

  // Listen to Supabase auth state changes
  useEffect(() => {
    const supabase = createClient()
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // Clear all React Query cache on logout to prevent showing previous user's data
        queryClient.clear()
        // Invalidate all queries
        queryClient.invalidateQueries()
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Only invalidate auth query to fetch fresh user data
        // Don't clear all cache as it causes infinite refetch loops
        queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [queryClient])

  const value: AuthContextType = {
    user: user || null,
    isLoading,
    isAuthenticated: !!user,
    refetch: () => {
      refetch()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
