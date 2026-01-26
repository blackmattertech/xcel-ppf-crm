'use client'

import { useQuery } from '@tanstack/react-query'

interface Product {
  id: string
  title: string
  description: string | null
  price: number
  mrp: number
  image_url: string | null
  sku: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ProductWithStats extends Product {
  leads_interested: number
  customers_bought: number
}

async function fetchProducts(): Promise<ProductWithStats[]> {
  const response = await fetch('/api/products?with_stats=true')
  if (!response.ok) {
    throw new Error('Failed to fetch products')
  }
  const data = await response.json()
  return data.products || []
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
