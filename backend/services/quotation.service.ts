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
  interface QuotationVersionRow {
    version: number
  }
  const { data: latestQuote } = await supabase
    .from('quotations')
    .select('version')
    .eq('lead_id', leadId)
    .order('version', { ascending: false })
    .limit(1)
    .single<QuotationVersionRow>()

  const version = latestQuote ? latestQuote.version + 1 : 1

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
        name,
        phone,
        email
      ),
      created_by_user:users!quotations_created_by_fkey (
        id,
        name
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
        name,
        phone,
        email
      ),
      created_by_user:users!quotations_created_by_fkey (
        id,
        name
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
        name,
        phone,
        email
      ),
      created_by_user:users!quotations_created_by_fkey (
        id,
        name
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

  const updateData = {
    status,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('quotations')
    .update(updateData as never)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update quotation: ${error.message}`)
  }

  return data
}
