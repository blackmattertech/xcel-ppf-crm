'use client'

import { useQuery } from '@tanstack/react-query'

interface FollowUp {
  id: string
  lead_id: string
  scheduled_at: string
  notes: string | null
  status: string
  created_at: string
  lead: {
    id: string
    name: string
    phone: string
  } | null
}

async function fetchFollowUps(): Promise<FollowUp[]> {
  const response = await fetch('/api/followups')
  if (!response.ok) {
    throw new Error('Failed to fetch follow-ups')
  }
  const data = await response.json()
  return data.followUps || []
}

export function useFollowUps() {
  return useQuery({
    queryKey: ['followups'],
    queryFn: fetchFollowUps,
    staleTime: 1 * 60 * 1000, // 1 minute (follow-ups change frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
