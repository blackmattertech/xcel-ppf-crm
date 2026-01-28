import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type Quotation = Database['public']['Tables']['quotations']['Row']
type QuotationInsert = Database['public']['Tables']['quotations']['Insert']

export interface QuotationItem {
  name: string
  description?: string
  quantity: number
  unit_price: number
  total: number
}

export async function createQuotation(
  leadId: string,
  items: QuotationItem[],
  validityDays: number = 30,
  discount: number = 0,
  gstRate: number = 18,
  createdBy: string
) {
  const supabase = createServiceClient()

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const discountAmount = discount
  const gst = ((subtotal - discountAmount) * gstRate) / 100
  const total = subtotal - discountAmount + gst

  // Generate quote number
  const quoteNumber = await generateQuoteNumber()

  // Calculate validity date
  const validityDate = new Date()
  validityDate.setDate(validityDate.getDate() + validityDays)

  // Get latest version for this lead
  const { data: latestQuote } = await supabase
    .from('quotations')
    .select('version')
    .eq('lead_id', leadId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const latestQuoteData = latestQuote as { version: number } | null
  const version = latestQuoteData ? latestQuoteData.version + 1 : 1

  const { data, error } = await supabase
    .from('quotations')
    .insert({
      lead_id: leadId,
      quote_number: quoteNumber,
      version,
      items: items as any,
      subtotal,
      discount: discountAmount,
      gst,
      total,
      validity_date: validityDate.toISOString().split('T')[0],
      status: 'sent',
      created_by: createdBy,
    } as any)
    .select(`
      *,
      lead:leads (
        id,
        first_name,
        last_name,
        phone,
        email
      ),
      created_by_user:profiles!quotations_created_by_fkey (
        id,
        full_name,
        email
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to create quotation: ${error.message}`)
  }

  return data
}

async function generateQuoteNumber(): Promise<string> {
  const supabase = createServiceClient()
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  
  // Get count of quotes today
  const { count } = await supabase
    .from('quotations')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString().split('T')[0])

  const sequence = ((count || 0) + 1).toString().padStart(4, '0')
  return `QUOTE-${dateStr}-${sequence}`
}

export async function getQuotations(filters?: {
  leadId?: string
  status?: string
  createdBy?: string
}) {
  const supabase = createServiceClient()

  let query = supabase
    .from('quotations')
    .select(`
      *,
      lead:leads (
        id,
        first_name,
        last_name,
        phone,
        email
      ),
      created_by_user:profiles!quotations_created_by_fkey (
        id,
        full_name,
        email
      )
    `)
    .order('created_at', { ascending: false })

  if (filters?.leadId) {
    query = query.eq('lead_id', filters.leadId)
  }

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.createdBy) {
    query = query.eq('created_by', filters.createdBy)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch quotations: ${error.message}`)
  }

  return data
}

export async function getQuotationById(id: string) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('quotations')
    .select(`
      *,
      lead:leads (
        id,
        first_name,
        last_name,
        phone,
        email
      ),
      created_by_user:profiles!quotations_created_by_fkey (
        id,
        full_name,
        email
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(`Failed to fetch quotation: ${error.message}`)
  }

  return data
}

export async function updateQuotationStatus(id: string, status: 'sent' | 'viewed' | 'accepted' | 'expired') {
  const supabase = createServiceClient()

  // Get quotation with lead info
  const { data: quotation, error: fetchError } = await supabase
    .from('quotations')
    .select('lead_id')
    .eq('id', id)
    .single()

  if (fetchError || !quotation) {
    throw new Error('Quotation not found')
  }

  // Update quotation status
  const { data, error } = await supabase
    .from('quotations')
    // @ts-ignore - Supabase type inference issue with dynamic updates
    .update({
      status,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update quotation: ${error.message}`)
  }

  // Get lead info for status update and follow-up creation
  const { data: lead } = await supabase
    .from('leads')
    .select('id, status, assigned_to')
    .eq('id', (quotation as any).lead_id)
    .single()

  if (lead) {
    const leadData = lead as { id: string; status: string; assigned_to: string | null }
    // Update lead status based on quotation status
    let newLeadStatus: string | null = null
    if (status === 'viewed' && leadData.status !== 'quotation_viewed') {
      newLeadStatus = 'quotation_viewed'
    } else if (status === 'accepted' && leadData.status !== 'quotation_accepted') {
      newLeadStatus = 'quotation_accepted'
    } else if (status === 'expired' && leadData.status !== 'quotation_expired') {
      newLeadStatus = 'quotation_expired'
    }

    if (newLeadStatus) {
      await supabase
        .from('leads')
        // @ts-ignore - Supabase type inference issue with dynamic updates
        .update({
          status: newLeadStatus,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', leadData.id)

      // Create status history
      await supabase.from('lead_status_history').insert({
        lead_id: leadData.id,
        old_status: leadData.status,
        new_status: newLeadStatus,
        changed_by: leadData.assigned_to || leadData.id, // Use assigned user or lead ID as fallback
        notes: `Quotation ${status}`,
      } as any)
    }

    // Auto-create follow-up for viewed or expired quotations
    if ((status === 'viewed' || status === 'expired') && leadData.assigned_to) {
      try {
        const followUpDate = new Date()
        if (status === 'viewed') {
          // Follow up in 2 days if viewed
          followUpDate.setDate(followUpDate.getDate() + 2)
        } else if (status === 'expired') {
          // Follow up immediately if expired
          followUpDate.setHours(followUpDate.getHours() + 1)
        }

        await supabase
          .from('follow_ups')
          // @ts-ignore - Supabase type inference issue with dynamic inserts
          .insert({
            lead_id: leadData.id,
            assigned_to: leadData.assigned_to,
            scheduled_at: followUpDate.toISOString(),
            notes: `Auto-scheduled follow-up: Quotation ${status}`,
            status: 'pending',
          } as any)
      } catch (followUpError) {
        // Log but don't fail the quotation update
        console.error('Failed to create automatic follow-up for quotation:', followUpError)
      }
    }
  }

  return data
}
