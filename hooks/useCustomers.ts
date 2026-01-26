'use client'

import { useQuery } from '@tanstack/react-query'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  customer_type: string
  created_at: string
}

async function fetchCustomers(): Promise<Customer[]> {
  const response = await fetch('/api/customers')
  if (!response.ok) {
    throw new Error('Failed to fetch customers')
  }
  const data = await response.json()
  return data.customers || []
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: fetchCustomers,
    staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
    // Optimize for faster loading
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
