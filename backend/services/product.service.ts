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
 * Check if a product name matches a lead's requirement or meta_data
 * Handles variations like "Paint Protection Film (PPF)" matching "paint_protection_film"
 */
function productMatchesLead(productTitle: string, leadRequirement: string | null, leadMetaData: any): boolean {
  const normalizedProduct = normalizeProductName(productTitle)
  const productKeyWords = extractKeyWords(productTitle)
  
  // Check requirement field
  if (leadRequirement) {
    const normalizedRequirement = normalizeProductName(leadRequirement)
    
    // Direct normalized match
    if (normalizedRequirement === normalizedProduct) {
      return true
    }
    
    // Substring match (one contains the other)
    if (normalizedRequirement.includes(normalizedProduct) || normalizedProduct.includes(normalizedRequirement)) {
      return true
    }
    
    // Check if key words from product appear in requirement
    const requirementKeyWords = extractKeyWords(leadRequirement)
    const matchingWords = productKeyWords.filter(word => 
      requirementKeyWords.some(rw => rw.includes(word) || word.includes(rw))
    )
    if (matchingWords.length >= Math.min(2, productKeyWords.length)) {
      return true
    }
  }
  
  // Check meta_data for product/service (direct keys + field_data array from Meta Lead Ads)
  const interestedProduct = getInterestedProductFromMeta(leadMetaData)
  if (interestedProduct) {
    const normalizedValue = normalizeProductName(interestedProduct)

    // Direct normalized match
    if (normalizedValue === normalizedProduct) {
      return true
    }

    // Substring match
    if (normalizedValue.includes(normalizedProduct) || normalizedProduct.includes(normalizedValue)) {
      return true
    }

    // Check if key words from product appear in the value
    const valueKeyWords = extractKeyWords(interestedProduct)
    const matchingWords = productKeyWords.filter(word =>
      valueKeyWords.some(vw => vw.includes(word) || word.includes(vw))
    )
    if (matchingWords.length >= Math.min(2, productKeyWords.length)) {
      return true
    }
  }
  
  return false
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

export async function getProductsWithStats(): Promise<ProductWithStats[]> {
  const supabase = createServiceClient()
  
  // Get all products
  const products = await getAllProducts()
  
  // Get all leads with requirement and meta_data
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, requirement, meta_data')
  
  if (leadsError) {
    throw new Error(`Failed to fetch leads: ${leadsError.message}`)
  }
  
  // Get all orders with lead information
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, lead_id, product_id')
    .not('lead_id', 'is', null)
  
  if (ordersError) {
    throw new Error(`Failed to fetch orders: ${ordersError.message}`)
  }
  
  // Get leads for orders
  const typedOrders = (orders || []) as { id: string; lead_id: string | null; product_id: string | null }[]
  const leadIds = typedOrders.map(o => o.lead_id).filter(Boolean) as string[] || []
  const { data: orderLeads, error: orderLeadsError } = leadIds.length > 0
    ? await supabase
        .from('leads')
        .select('id, requirement, meta_data')
        .in('id', leadIds)
    : { data: [], error: null }
  
  if (orderLeadsError) {
    throw new Error(`Failed to fetch order leads: ${orderLeadsError.message}`)
  }
  
  // Calculate stats for each product
  const typedLeads = (leads || []) as { id: string; requirement: string | null; meta_data: any }[]
  const typedOrderLeads = (orderLeads || []) as { id: string; requirement: string | null; meta_data: any }[]

  const productsWithStats: ProductWithStats[] = products.map(product => {
    // Count leads interested
    const leadsInterested = typedLeads.filter(lead => 
      productMatchesLead(product.title, lead.requirement, lead.meta_data)
    ).length
    
    // Count customers who bought (through orders)
    // First check if order has product_id matching
    const ordersWithProductId = typedOrders.filter(o => o.product_id === product.id).length
    
    // Then check if order's lead matches product by name
    const ordersWithMatchingLead = typedOrderLeads.filter(lead => 
      productMatchesLead(product.title, lead.requirement, lead.meta_data)
    ).length
    
    // Total customers bought = orders with product_id OR orders with matching lead
    const customersBought = Math.max(ordersWithProductId, ordersWithMatchingLead)
    
    return {
      ...product,
      leads_interested: leadsInterested,
      customers_bought: customersBought,
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
