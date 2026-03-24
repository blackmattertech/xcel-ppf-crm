'use client'

import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './AuthProvider'
import { PushNotificationProvider } from './PushNotificationProvider'

// Create a single QueryClient instance per browser session.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
    },
  },
})

interface ClientProvidersProps {
  children: ReactNode
}

/**
 * Top-level client providers:
 * - AuthProvider centralises Supabase auth and role resolution.
 * - PushNotificationProvider registers FCM token on sign-in and listens for foreground push.
 * - React Query caches and deduplicates read-only API calls.
 */
export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PushNotificationProvider>{children}</PushNotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

