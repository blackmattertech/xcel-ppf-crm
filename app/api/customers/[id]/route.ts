import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()
    
    // Get customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Get orders for this customer (including lead payment amount for totals)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        *,
        lead:leads (
          payment_amount
        )
      `
      )
      .eq('customer_id', id)
      .order('created_at', { ascending: false })

    if (ordersError) {
      console.error('Failed to fetch orders:', ordersError)
    }

    // Get lead metadata if customer has a lead_id
    let leadMetadata = null
    if (customer.lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('meta_data, campaign_id, ad_id, adset_id, form_id, form_name, ad_name, campaign_name, source')
        .eq('id', customer.lead_id)
        .single()
      
      if (!leadError && lead) {
        leadMetadata = {
          meta_data: lead.meta_data,
          campaign_id: lead.campaign_id,
          ad_id: lead.ad_id,
          adset_id: lead.adset_id,
          form_id: lead.form_id,
          form_name: lead.form_name,
          ad_name: lead.ad_name,
          campaign_name: lead.campaign_name,
          source: lead.source,
        }
      }
    }

    return NextResponse.json({
      customer,
      orders: orders || [],
      leadMetadata,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}
