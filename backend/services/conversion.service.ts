import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'
import { LEAD_STATUS } from '@/shared/constants/lead-status'

export async function convertLeadToCustomer(leadId: string) {
  const supabase = createServiceClient()

  // Get lead
  interface LeadRow {
    status: string
    phone: string
    name: string
    email: string | null
    [key: string]: any
  }
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single<LeadRow>()

  if (leadError || !lead) {
    throw new Error('Lead not found')
  }

  if (lead.status !== LEAD_STATUS.CONVERTED) {
    throw new Error('Lead must be in converted status before creating customer')
  }

  // Check if customer already exists
  interface CustomerIdRow {
    id: string
  }
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', lead.phone)
    .single<CustomerIdRow>()

  if (existingCustomer) {
    // Update existing customer
    const leadData = lead as any
    const updateData = {
      name: leadData.name,
      email: leadData.email || null,
      customer_type: 'repeat',
      updated_at: new Date().toISOString(),
    }
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .update(updateData as never)
      .eq('id', existingCustomer.id)
      .select()
      .single()

    if (customerError) {
      throw new Error(`Failed to update customer: ${customerError.message}`)
    }

    return customer
  }

  // Create new customer
  const leadData = lead as any
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      lead_id: leadId,
      name: leadData.name,
      phone: leadData.phone,
      email: leadData.email || null,
      customer_type: 'new',
    } as any)
    .select()
    .single()

  if (customerError) {
    throw new Error(`Failed to create customer: ${customerError.message}`)
  }

  return customer
}

export async function createOrderFromLead(leadId: string, customerId: string, assignedTeam?: string) {
  const supabase = createServiceClient()

  // Generate order number
  const orderNumber = await generateOrderNumber()

  const { data, error } = await supabase
    .from('orders')
    .insert({
      customer_id: customerId,
      lead_id: leadId,
      order_number: orderNumber,
      status: 'pending',
      payment_status: 'pending',
      assigned_team: assignedTeam || null,
    } as any)
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
        name
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to create order: ${error.message}`)
  }

  return data
}

async function generateOrderNumber(): Promise<string> {
  const supabase = createServiceClient()
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  
  // Get count of orders today
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString().split('T')[0])

  const sequence = ((count || 0) + 1).toString().padStart(4, '0')
  return `ORDER-${dateStr}-${sequence}`
}
