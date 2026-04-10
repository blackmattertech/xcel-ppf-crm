/**
 * Cache Invalidation Helpers
 * 
 * Centralized cache invalidation functions to ensure data consistency
 * Call these functions after any write operations (create, update, delete)
 */

import { invalidateCachePrefix, deleteCache, CACHE_KEYS } from './cache'

/**
 * Invalidate all lead-related caches.
 * Call after creating, updating, or deleting leads.
 * Pass requirementChanged=true only when the lead's requirement field changed,
 * so we don't wipe the expensive product_stats cache on every update.
 */
export async function invalidateLeadCaches(leadId?: string, requirementChanged = false): Promise<void> {
  const tasks: Promise<unknown>[] = [
    invalidateCachePrefix(CACHE_KEYS.LEADS_LIST),
    invalidateCachePrefix(CACHE_KEYS.ANALYTICS),
    invalidateCachePrefix(CACHE_KEYS.DASHBOARD),
  ]

  // Only rebuild product stats when the requirement actually changed — it's expensive
  if (requirementChanged) {
    tasks.push(deleteCache(CACHE_KEYS.PRODUCTS_WITH_STATS))
  }

  await Promise.all(tasks)

  if (leadId) {
    await deleteCache(`${CACHE_KEYS.LEAD}:${leadId}`)
  }
}

/**
 * Invalidate all customer-related caches
 */
export async function invalidateCustomerCaches(customerId?: string): Promise<void> {
  await Promise.all([
    invalidateCachePrefix(CACHE_KEYS.CUSTOMERS_LIST),
    invalidateCachePrefix(CACHE_KEYS.ANALYTICS),
    invalidateCachePrefix(CACHE_KEYS.DASHBOARD),
  ])

  if (customerId) {
    await deleteCache(`${CACHE_KEYS.CUSTOMER}:${customerId}`)
  }
}

/**
 * Invalidate all product-related caches
 */
export async function invalidateProductCaches(productId?: string): Promise<void> {
  await Promise.all([
    invalidateCachePrefix(CACHE_KEYS.PRODUCTS_LIST),
    deleteCache(CACHE_KEYS.PRODUCTS_WITH_STATS),
  ])

  if (productId) {
    await deleteCache(`${CACHE_KEYS.PRODUCT}:${productId}`)
  }
}

/**
 * Invalidate all analytics and dashboard caches
 * Call after any data changes that affect metrics
 */
export async function invalidateAnalyticsCaches(): Promise<void> {
  await Promise.all([
    invalidateCachePrefix(CACHE_KEYS.ANALYTICS),
    invalidateCachePrefix(CACHE_KEYS.DASHBOARD),
    deleteCache(CACHE_KEYS.PRODUCTS_WITH_STATS),
  ])
}

/**
 * Invalidate user session cache
 */
export async function invalidateUserSession(userId: string): Promise<void> {
  await deleteCache(`${CACHE_KEYS.USER_SESSION}:${userId}`)
  await deleteCache(`${CACHE_KEYS.USER}:${userId}`)
}

/**
 * Invalidate all caches (use with caution - only for major data changes)
 */
export async function invalidateAllCaches(): Promise<void> {
  await Promise.all([
    invalidateCachePrefix(CACHE_KEYS.LEAD),
    invalidateCachePrefix(CACHE_KEYS.CUSTOMER),
    invalidateCachePrefix(CACHE_KEYS.PRODUCT),
    invalidateCachePrefix(CACHE_KEYS.ANALYTICS),
    invalidateCachePrefix(CACHE_KEYS.DASHBOARD),
    invalidateCachePrefix(CACHE_KEYS.QUOTATION),
    invalidateCachePrefix(CACHE_KEYS.FOLLOWUP),
    deleteCache(CACHE_KEYS.PRODUCTS_WITH_STATS),
  ])
}
