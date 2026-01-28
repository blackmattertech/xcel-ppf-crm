import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const createCustomerSchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().nullable().optional(),
  customer_type: z.enum(['new', 'repeat', 'high_value']).default('new'),
  tags: z.array(z.string()).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.CUSTOMERS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        return NextResponse.json({ customers: [] })
      }
      throw new Error(`Failed to fetch customers: ${error.message}`)
    }
    const customers = (data || []) as any[]

    if (customers.length === 0) {
      return NextResponse.json({ customers: [] })
    }

    // Compute total closed business per customer by joining orders -> leads.payment_amount
    const customerIds = customers.map((c) => c.id)

    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        customer_id,
        payment_status,
        lead:leads (
          payment_amount
        )
      `
      )
      .in('customer_id', customerIds)

    if (ordersError) {
      console.error('Failed to fetch customer orders for totals:', ordersError)
    }

    const revenueMap = new Map<string, number>()

    ;(orderRows || []).forEach((row: any) => {
      if (!row.customer_id) return
      const isClosed = row.payment_status === 'fully_paid'
      const amount = row.lead?.payment_amount ? Number(row.lead.payment_amount) : 0
      if (!isClosed || !amount || Number.isNaN(amount)) return

      const prev = revenueMap.get(row.customer_id) || 0
      revenueMap.set(row.customer_id, prev + amount)
    })

    const customersWithTotals = customers.map((customer) => ({
      ...customer,
      total_revenue: revenueMap.get(customer.id) || 0,
    }))

    return NextResponse.json({ customers: customersWithTotals })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch customers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.CUSTOMERS_CREATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const customerData = createCustomerSchema.parse(body)

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...customerData,
        tags: customerData.tags || null,
      } as any)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create customer: ${error.message}`)
    }

    return NextResponse.json({ customer: data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create customer' },
      { status: 500 }
    )
  }
}
