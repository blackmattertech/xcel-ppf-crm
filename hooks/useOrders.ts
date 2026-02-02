'use client'

import { useQuery } from '@tanstack/react-query'

interface Order {
  id: string
  customer_id: string
  product_id: string | null
  total_amount: number
  status: string
  payment_status: string
  created_at: string
  customer: {
    id: string
    name: string
    phone: string
    email: string | null
  }
  product: {
    id: string
    title: string
  } | null
}

async function fetchOrders(): Promise<Order[]> {
  const response = await fetch('/api/orders')
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    const errorMessage = errorData.error || `Failed to fetch orders (${response.status})`
    console.error('Failed to fetch orders:', errorMessage, response.status)
    throw new Error(errorMessage)
  }
  const data = await response.json()
  return data.orders || []
}

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
