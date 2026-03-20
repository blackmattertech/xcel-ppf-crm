import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { createExternalServiceClient, getExternalCustomersTable } from '@/lib/supabase/service-ext'

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
    source: 'external',
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const isExternal = id.startsWith('ext_')
    const rawId = isExternal ? id.slice(4) : id

    if (isExternal) {
      const extClient = createExternalServiceClient()
      const extTable = getExternalCustomersTable()
      if (!extClient) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      const { data: row, error } = await extClient
        .from(extTable)
        .select('*')
        .eq('id', rawId)
        .single()
      if (error || !row) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      const customer = normalizeExternalRow(row as Record<string, unknown>, 'ext_')
      return NextResponse.json({ customer, orders: [] })
    }

    const supabase = createServiceClient()
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*, lead:leads (payment_amount)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })

    if (ordersError) console.error('Failed to fetch orders:', ordersError)

    return NextResponse.json({
      customer,
      orders: orders || [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}
