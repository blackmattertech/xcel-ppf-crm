import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { createExternalServiceClient, getExternalCustomersTable } from '@/lib/supabase/service-ext'
import { normalizeExternalCustomerRow } from '@/lib/external-customer-normalize'
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
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()
    const extClient = createExternalServiceClient()
    const extTable = getExternalCustomersTable()

    // Fetch primary customers and external customers in parallel
    const [primaryResult, externalResult] = await Promise.all([
      supabase
        .from('customers')
        .select('id, lead_id, name, phone, email, customer_type, tags, created_at, updated_at')
        .order('created_at', { ascending: false }),
      extClient
        ? extClient
            .from(extTable)
            // Use * — not an explicit "warranty_claims" field: PostgREST treats that name as an FK embed
            // when listed with other columns, which breaks (e.g. column warranty_claims.customer_type does not exist).
            .select('*')
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null, error: null }),
    ])

    if (primaryResult.error) {
      if (primaryResult.error.code === '42P01') return NextResponse.json({ customers: [] })
      throw new Error(`Failed to fetch customers: ${primaryResult.error.message}`)
    }

    const primaryCustomers = (primaryResult.data || []) as any[]

    let externalRows: Record<string, unknown>[] = []
    if (externalResult.data && !externalResult.error) {
      externalRows = externalResult.data as Record<string, unknown>[]
    } else if (externalResult.error && (externalResult.error as any).code !== '42P01') {
      console.error('External customers fetch error:', (externalResult.error as any).message)
    }

    // Fetch revenue for primary customers only if there are any
    const primaryIds = primaryCustomers.map((c) => c.id)
    const revenueMap = new Map<string, number>()
    if (primaryIds.length > 0) {
      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('customer_id, payment_status, lead:leads(payment_amount)')
        .in('customer_id', primaryIds)
        .eq('payment_status', 'fully_paid')
      if (!ordersError && Array.isArray(orderRows)) {
        for (const row of orderRows as any[]) {
          if (!row.customer_id) continue
          const amount = row.lead?.payment_amount ? Number(row.lead.payment_amount) : 0
          if (!amount || Number.isNaN(amount)) continue
          revenueMap.set(row.customer_id, (revenueMap.get(row.customer_id) || 0) + amount)
        }
      }
    }

    const primaryWithRevenue = primaryCustomers.map((c) => ({
      ...c,
      total_revenue: revenueMap.get(c.id) || 0,
    }))
    const externalNormalized = externalRows.map((row) => {
      const normalized = normalizeExternalCustomerRow(row, 'ext_') as Record<string, unknown>
      const { warranty_claims: _wc, ...listFields } = normalized
      return { ...listFields, total_revenue: 0 }
    })

    const combined = [...primaryWithRevenue, ...externalNormalized].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return NextResponse.json({ customers: combined })
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
