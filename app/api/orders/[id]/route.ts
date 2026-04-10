import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { invalidateAnalyticsCaches } from '@/lib/cache-invalidation'
import { z } from 'zod'

const updateOrderSchema = z.object({
  payment_status: z.enum(['pending', 'advance_received', 'fully_paid']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
})

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
    
    // Get order with customer and lead info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customers (
          id,
          name,
          phone,
          email
        ),
        lead:leads (
          id,
          requirement,
          meta_data
        )
      `)
      .eq('id', id)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ order })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const updates = updateOrderSchema.parse(body)

    const supabase = createServiceClient()
    
    // Update order
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    }
    const { data: order, error: updateError } = await supabase
      .from('orders')
      // @ts-ignore - Supabase type inference issue with dynamic updates
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        customer:customers (
          id,
          name,
          phone,
          email
        )
      `)
      .single()

    if (updateError) {
      throw new Error(`Failed to update order: ${updateError.message}`)
    }

    // If payment status is fully_paid, also update the lead's payment_status and check if we should remove it from leads page
    const orderData = order as any
    if (updates.payment_status === 'fully_paid' && orderData?.lead_id) {
      const { error: leadUpdateError } = await supabase
        .from('leads')
        // @ts-ignore - Supabase type inference issue with dynamic updates
        .update({
          payment_status: 'fully_paid',
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', orderData.lead_id)

      if (leadUpdateError) {
        console.error('Failed to update lead payment status:', leadUpdateError)
      }
    }

    await invalidateAnalyticsCaches()

    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update order' },
      { status: 500 }
    )
  }
}
