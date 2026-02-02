'use client'

import { useQuery } from '@tanstack/react-query'

interface Quotation {
  id: string
  lead_id: string
  amount: number
  status: string
  created_at: string
  lead: {
    id: string
    name: string
    phone: string
  }
}

async function fetchQuotations(): Promise<Quotation[]> {
  const response = await fetch('/api/quotations')
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    const errorMessage = errorData.error || `Failed to fetch quotations (${response.status})`
    console.error('Failed to fetch quotations:', errorMessage, response.status)
    throw new Error(errorMessage)
  }
  const data = await response.json()
  return data.quotations || []
}

export function useQuotations() {
  return useQuery({
    queryKey: ['quotations'],
    queryFn: fetchQuotations,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
