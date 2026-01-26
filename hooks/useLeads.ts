'use client'

import { useQuery } from '@tanstack/react-query'

interface Lead {
  id: string
  lead_id: string
  name: string
  phone: string
  email: string | null
  source: string
  status: string
  interest_level: string | null
  requirement: string | null
  meta_data: Record<string, any> | null
  lead_score?: number | null
  has_active_sla_violation?: boolean
  assigned_user: {
    id: string
    name: string
    email: string
    profile_image_url: string | null
  } | null
  customer?: {
    id: string
    lead_id: string
  } | null
  created_at: string
  updated_at: string
  first_contact_at: string | null
}

async function fetchLeads(): Promise<Lead[]> {
  const response = await fetch('/api/leads')
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    const errorMessage = errorData.error || `Failed to fetch leads (${response.status})`
    console.error('Failed to fetch leads:', errorMessage, response.status)
    throw new Error(errorMessage)
  }
  const data = await response.json()
  return data.leads || []
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
    staleTime: 0, // Always consider stale to ensure fresh data after updates
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: true, // Refetch when component mounts to get latest data
    refetchOnWindowFocus: true, // Refetch when window regains focus
  })
}
