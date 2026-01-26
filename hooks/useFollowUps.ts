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
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    const errorMessage = errorData.error || `Failed to fetch follow-ups (${response.status})`
    console.error('Failed to fetch follow-ups:', errorMessage, response.status)
    throw new Error(errorMessage)
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
