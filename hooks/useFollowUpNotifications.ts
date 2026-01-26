'use client'

import { useQuery } from '@tanstack/react-query'

interface FollowUp {
  id: string
  scheduled_at: string
  notes: string | null
  lead: {
    id: string
    name: string
    phone: string
  } | null
}

interface FollowUpNotifications {
  overdue: FollowUp[]
  upcoming: FollowUp[]
  totalPending: number
  adminNotifications?: FollowUp[]
}

async function fetchFollowUpNotifications(): Promise<FollowUpNotifications> {
  const response = await fetch('/api/followups/notifications')
  if (!response.ok) {
    throw new Error('Failed to fetch follow-up notifications')
  }
  return response.json()
}

export function useFollowUpNotifications(enabled: boolean = true) {
  return useQuery({
    queryKey: ['followups', 'notifications'],
    queryFn: fetchFollowUpNotifications,
    enabled,
    staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
    retry: 1,
  })
}
