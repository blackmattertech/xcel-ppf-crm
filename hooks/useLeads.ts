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
  assigned_user: {
    id: string
    name: string
    email: string
    profile_image_url: string | null
  } | null
  created_at: string
  updated_at: string
  first_contact_at: string | null
}

async function fetchLeads(): Promise<Lead[]> {
  const response = await fetch('/api/leads')
  if (!response.ok) {
    throw new Error('Failed to fetch leads')
  }
  const data = await response.json()
  return data.leads || []
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
    staleTime: 1 * 60 * 1000, // 1 minute (leads change frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
