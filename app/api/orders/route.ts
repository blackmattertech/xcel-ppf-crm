import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customers (
          name,
          phone
        ),
        lead:leads (
          id,
          requirement,
          meta_data
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        return NextResponse.json({ orders: [] })
      }
      throw new Error(`Failed to fetch orders: ${error.message}`)
    }

    return NextResponse.json({ orders: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}
