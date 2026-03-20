import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { createExternalServiceClient, getExternalCustomersTable } from '@/lib/supabase/service-ext'
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

/** Normalize external DB row (claims schema: customer_name, customer_email, customer_mobile, car_*, service_*, etc.) to customer shape. */
function normalizeExternalRow(row: Record<string, unknown>, prefixId: string): Record<string, unknown> {
  const id = row.id != null ? String(row.id) : ''
  const name = (row.customer_name ?? row.name ?? row.full_name ?? '').toString().trim() || '—'
  const phone = (row.customer_mobile ?? row.phone ?? row.mobile ?? row.phone_number ?? row.alternate_mobile ?? '').toString().trim() || '—'
  const email = (row.customer_email ?? row.email ?? row.store_email) != null ? String(row.customer_email ?? row.email ?? row.store_email) : null
  const customer_type = (row.customer_type ?? row.type ?? 'new') as string
  const validType = ['new', 'repeat', 'high_value'].includes(customer_type) ? customer_type : 'new'
  let tags: string[] | null = null
  if (Array.isArray(row.tags)) tags = row.tags.map(String)
  else if (row.tags != null && typeof row.tags === 'string') tags = [row.tags]
  const created_at = (row.created_at ?? row.createdAt ?? new Date().toISOString()).toString()
  const updated_at = (row.updated_at ?? row.updatedAt ?? created_at).toString()
  return {
    id: prefixId + id,
    lead_id: null,
    name,
    phone,
    email,
    customer_type: validType,
    tags,
    created_at,
    updated_at,
    source: 'external' as const,
    car_number: row.car_number != null ? String(row.car_number) : null,
    chassis_number: row.chassis_number != null ? String(row.chassis_number) : null,
    service_type: row.service_type != null ? String(row.service_type) : null,
    series: row.series != null ? String(row.series) : null,
    service_date: row.service_date != null ? String(row.service_date) : null,
    service_location: row.service_location != null ? String(row.service_location) : null,
    dealer_name: row.dealer_name != null ? String(row.dealer_name) : null,
    warranty_years: row.warranty_years != null ? Number(row.warranty_years) : null,
    ppf_warranty_years: row.ppf_warranty_years != null ? Number(row.ppf_warranty_years) : null,
    car_name: row.car_name != null ? String(row.car_name) : null,
    car_model: row.car_model != null ? String(row.car_model) : null,
    car_photo_url: row.car_photo_url != null ? String(row.car_photo_url) : null,
    chassis_photo_url: row.chassis_photo_url != null ? String(row.chassis_photo_url) : null,
    dealer_invoice_url: row.dealer_invoice_url != null ? String(row.dealer_invoice_url) : null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.CUSTOMERS_READ)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ customers: [] })
      throw new Error(`Failed to fetch customers: ${error.message}`)
    }
    let primaryCustomers = (data || []) as any[]

    // Optionally fetch from external database
    const extClient = createExternalServiceClient()
    const extTable = getExternalCustomersTable()
    let externalRows: Record<string, unknown>[] = []
    if (extClient) {
      const { data: extData, error: extError } = await extClient
        .from(extTable)
        .select('*')
        .order('created_at', { ascending: false })
      if (!extError && Array.isArray(extData)) {
        externalRows = extData as Record<string, unknown>[]
      } else if (extError && extError.code !== '42P01') {
        console.error('External customers fetch error:', extError.message)
      }
    }

    const primaryIds = primaryCustomers.map((c) => c.id)
    let revenueMap = new Map<string, number>()
    if (primaryIds.length > 0) {
      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('customer_id, payment_status, lead:leads (payment_amount)')
        .in('customer_id', primaryIds)
      if (!ordersError && Array.isArray(orderRows)) {
        orderRows.forEach((row: any) => {
          if (!row.customer_id) return
          if (row.payment_status !== 'fully_paid') return
          const amount = row.lead?.payment_amount ? Number(row.lead.payment_amount) : 0
          if (!amount || Number.isNaN(amount)) return
          revenueMap.set(row.customer_id, (revenueMap.get(row.customer_id) || 0) + amount)
        })
      }
    }

    const primaryWithRevenue = primaryCustomers.map((c) => ({
      ...c,
      total_revenue: revenueMap.get(c.id) || 0,
    }))
    const externalNormalized = externalRows.map((row) => ({
      ...normalizeExternalRow(row, 'ext_'),
      total_revenue: 0,
    }))

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
