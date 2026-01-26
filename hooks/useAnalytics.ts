'use client'

import { useQuery } from '@tanstack/react-query'

interface Analytics {
  leadsBySource: Record<string, number>
  leadsByStatus: Record<string, number>
  conversionRate: number
  repPerformance: Array<{
    user_id: string
    user_name: string
    total_leads: number
    converted_leads: number
    conversion_rate: number
  }>
  followUpCompliance: number
  slaBreaches: number
}

async function fetchAnalytics(): Promise<Analytics> {
  const response = await fetch('/api/analytics')
  if (!response.ok) {
    throw new Error('Failed to fetch analytics')
  }
  return response.json()
}

export function useAnalytics() {
  return useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
