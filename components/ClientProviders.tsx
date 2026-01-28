'use client'

import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './AuthProvider'

// Create a single QueryClient instance per browser session.
const queryClient = new QueryClient()

interface ClientProvidersProps {
  children: ReactNode
}

/**
 * Top-level client providers:
 * - AuthProvider centralises Supabase auth and role resolution.
 * - React Query caches and deduplicates read-only API calls.
 *
 * Behaviour of pages/components remains the same; this only
 * optimises how often and when data is fetched.
 */
export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}

