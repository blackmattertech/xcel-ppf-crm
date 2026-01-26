'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: fetchUserData,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 1,
    // Optimize for faster initial load
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

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
