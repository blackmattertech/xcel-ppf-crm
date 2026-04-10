import { createServiceClient } from '@/lib/supabase/service'
import { getInterestedProductFromMeta } from '@/shared/utils/lead-meta'

export interface Product {
  id: string
  title: string
  description: string | null
  price: number
  mrp: number
  image_url: string | null
  sku: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProductWithStats extends Product {
  leads_interested: number
  customers_bought: number
}

export interface CreateProductInput {
  title: string
  description?: string
  price: number
  mrp: number
  image_url?: string
  sku?: string
  is_active?: boolean
  created_by: string
}

export interface UpdateProductInput {
  title?: string
  description?: string
  price?: number
  mrp?: number
  image_url?: string
  sku?: string
  is_active?: boolean
}

/**
 * Normalize product name for matching
 * Converts to lowercase, removes special characters, spaces, underscores, hyphens
 * Also removes content in parentheses (like "(PPF)")
 */
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    // Remove content in parentheses (e.g., "(PPF)", "(Premium)")
    .replace(/\s*\([^)]*\)\s*/g, '')
    // Replace underscores, spaces, hyphens with nothing
    .replace(/[_\s-]/g, '')
    // Remove all special characters except alphanumeric
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Extract key words from a product name (for better matching)
 * Returns an array of significant words
 */
function extractKeyWords(text: string): string[] {
  const normalized = text.toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, '') // Remove parentheses content
    .replace(/[^a-z0-9\s]/g, '') // Keep only alphanumeric and spaces
    .trim()
  
  // Split into words and filter out common stop words
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
  return normalized
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word))
}

/**
 * Get a string value from meta_data: top-level key or from field_data array (Meta sync stores in field_data)
 */
function getMetaDataFieldValue(leadMetaData: any, ...fieldNames: string[]): string | null {
  if (!leadMetaData || typeof leadMetaData !== 'object') return null
  for (const fieldName of fieldNames) {
    if (leadMetaData[fieldName] != null) {
      const v = String(leadMetaData[fieldName]).trim()
      if (v) return v
    }
    const arr = leadMetaData.field_data
    if (Array.isArray(arr)) {
      const item = arr.find((e: { name?: string }) => e && e.name === fieldName)
      const val = (item as { values?: string[] })?.values?.[0]
      if (val != null) {
        const v = String(val).trim()
        if (v) return v
      }
    }
  }
  return null
}


export async function getAllProducts(): Promise<Product[]> {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`)
  }
  
  return data || []
}

export async function getProductById(id: string): Promise<Product | null> {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw new Error(`Failed to fetch product: ${error.message}`)
  }
  
  return data
}

/** Pre-computed per-lead data to avoid re-computing inside tight loops. */
interface NormalizedLead {
  id: string
  normReq: string | null
  reqKeyWords: string[] | null
  interestedProduct: string | null
  normInterested: string | null
  interestedKeyWords: string[] | null
}

function preNormalizeLead(lead: { id: string; requirement: string | null; meta_data: any }): NormalizedLead {
  const interestedProduct = getInterestedProductFromMeta(lead.meta_data) ?? null
  return {
    id: lead.id,
    normReq: lead.requirement ? normalizeProductName(lead.requirement) : null,
    reqKeyWords: lead.requirement ? extractKeyWords(lead.requirement) : null,
    interestedProduct,
    normInterested: interestedProduct ? normalizeProductName(interestedProduct) : null,
    interestedKeyWords: interestedProduct ? extractKeyWords(interestedProduct) : null,
  }
}

/** Fast match using pre-normalized lead data — avoids repeated string ops inside loops. */
function productMatchesNormalizedLead(
  normProduct: string,
  productKeyWords: string[],
  lead: NormalizedLead
): boolean {
  if (lead.normReq) {
    if (lead.normReq === normProduct) return true
    if (lead.normReq.includes(normProduct) || normProduct.includes(lead.normReq)) return true
    if (lead.reqKeyWords) {
      const matching = productKeyWords.filter(word =>
        lead.reqKeyWords!.some(rw => rw.includes(word) || word.includes(rw))
      )
      if (matching.length >= Math.min(2, productKeyWords.length)) return true
    }
  }
  if (lead.normInterested) {
    if (lead.normInterested === normProduct) return true
    if (lead.normInterested.includes(normProduct) || normProduct.includes(lead.normInterested)) return true
    if (lead.interestedKeyWords) {
      const matching = productKeyWords.filter(word =>
        lead.interestedKeyWords!.some(vw => vw.includes(word) || word.includes(vw))
      )
      if (matching.length >= Math.min(2, productKeyWords.length)) return true
    }
  }
  return false
}

export async function getProductsWithStats(): Promise<ProductWithStats[]> {
  const supabase = createServiceClient()

  // Fetch products, all leads, and orders in parallel
  const [products, leadsResult, ordersResult] = await Promise.all([
    getAllProducts(),
    supabase.from('leads').select('id, requirement, meta_data'),
    supabase.from('orders').select('id, lead_id, product_id').not('lead_id', 'is', null),
  ])

  if (leadsResult.error) throw new Error(`Failed to fetch leads: ${leadsResult.error.message}`)
  if (ordersResult.error) throw new Error(`Failed to fetch orders: ${ordersResult.error.message}`)

  const typedOrders = (ordersResult.data || []) as { id: string; lead_id: string | null; product_id: string | null }[]

  // Fetch order leads only if there are orders (avoid unnecessary query)
  const leadIds = typedOrders.map(o => o.lead_id).filter(Boolean) as string[]
  const orderLeadsResult = leadIds.length > 0
    ? await supabase.from('leads').select('id, requirement, meta_data').in('id', leadIds)
    : { data: [] as { id: string; requirement: string | null; meta_data: any }[], error: null }

  if (orderLeadsResult.error) throw new Error(`Failed to fetch order leads: ${orderLeadsResult.error.message}`)

  // Pre-normalize all leads ONCE — avoids O(products × leads) repeated string operations
  const normalizedLeads = (leadsResult.data || []).map(preNormalizeLead)
  const normalizedOrderLeads = (orderLeadsResult.data || []).map(preNormalizeLead)

  // Build product_id → order count map for O(1) lookup
  const productIdOrderCount = new Map<string, number>()
  for (const o of typedOrders) {
    if (o.product_id) productIdOrderCount.set(o.product_id, (productIdOrderCount.get(o.product_id) ?? 0) + 1)
  }

  const productsWithStats: ProductWithStats[] = products.map(product => {
    const normProduct = normalizeProductName(product.title)
    const productKeyWords = extractKeyWords(product.title)

    const leadsInterested = normalizedLeads.filter(lead =>
      productMatchesNormalizedLead(normProduct, productKeyWords, lead)
    ).length

    const ordersWithProductId = productIdOrderCount.get(product.id) ?? 0
    const ordersWithMatchingLead = normalizedOrderLeads.filter(lead =>
      productMatchesNormalizedLead(normProduct, productKeyWords, lead)
    ).length

    return {
      ...product,
      leads_interested: leadsInterested,
      customers_bought: Math.max(ordersWithProductId, ordersWithMatchingLead),
    }
  })

  return productsWithStats
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('products')
    // @ts-ignore - Supabase type inference issue with dynamic inserts
    .insert({
      title: input.title,
      description: input.description || null,
      price: input.price,
      mrp: input.mrp,
      image_url: input.image_url || null,
      sku: input.sku || null,
      is_active: input.is_active !== undefined ? input.is_active : true,
      created_by: input.created_by,
    })
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to create product: ${error.message}`)
  }
  
  return data
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const supabase = createServiceClient()
  
  const updateData: any = {}
  if (input.title !== undefined) updateData.title = input.title
  if (input.description !== undefined) updateData.description = input.description
  if (input.price !== undefined) updateData.price = input.price
  if (input.mrp !== undefined) updateData.mrp = input.mrp
  if (input.image_url !== undefined) updateData.image_url = input.image_url
  if (input.sku !== undefined) updateData.sku = input.sku
  if (input.is_active !== undefined) updateData.is_active = input.is_active
  
  const { data, error } = await supabase
    .from('products')
    // @ts-ignore - Supabase type inference issue with dynamic updates
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to update product: ${error.message}`)
  }
  
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = createServiceClient()
  
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
  
  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`)
  }
}
