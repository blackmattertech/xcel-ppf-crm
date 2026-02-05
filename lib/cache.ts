/**
 * Redis Cache Helper
 * 
 * Provides a simple, resilient caching layer that:
 * - Automatically falls back to DB if Redis fails
 * - Never crashes the application
 * - Supports TTL-based expiration
 * - Includes cache invalidation helpers
 * 
 * Usage:
 *   const cached = await getCache('key')
 *   if (cached) return cached
 *   
 *   const data = await fetchFromDB()
 *   await setCache('key', data, 60) // 60 seconds TTL
 *   return data
 */

import { getRedisClient, isRedisConnected } from './redis'

/**
 * Cache key prefixes for organization
 */
export const CACHE_KEYS = {
  LEAD: 'lead',
  LEADS_LIST: 'leads:list',
  LEAD_COUNT: 'leads:count',
  CUSTOMER: 'customer',
  CUSTOMERS_LIST: 'customers:list',
  ANALYTICS: 'analytics',
  DASHBOARD: 'dashboard',
  USER: 'user',
  USER_SESSION: 'session',
  PRODUCT: 'product',
  PRODUCTS_LIST: 'products:list',
  QUOTATION: 'quotation',
  FOLLOWUP: 'followup',
} as const

/**
 * Default TTL values (in seconds)
 */
export const CACHE_TTL = {
  SHORT: 30,      // 30 seconds - frequently changing data
  MEDIUM: 60,     // 1 minute - moderately stable data
  LONG: 120,      // 2 minutes - relatively stable data
  VERY_LONG: 300, // 5 minutes - very stable data
} as const

/**
 * Get cached value by key
 * Returns null if cache miss or Redis unavailable
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  const client = getRedisClient()
  
  if (!client || !isRedisConnected()) {
    // Graceful degradation: return null if Redis unavailable
    return null
  }

  try {
    const value = await client.get(key)
    
    if (value === null) {
      logCache('miss', key)
      return null
    }

    logCache('hit', key)
    return JSON.parse(value) as T
  } catch (error) {
    // Log but don't throw - fall back to DB
    console.warn(`[Cache] Error getting key "${key}":`, error instanceof Error ? error.message : error)
    logCache('error', key)
    return null
  }
}

/**
 * Set cached value with TTL
 * Silently fails if Redis unavailable
 */
export async function setCache(
  key: string,
  value: any,
  ttlSeconds: number = CACHE_TTL.MEDIUM
): Promise<boolean> {
  const client = getRedisClient()
  
  if (!client || !isRedisConnected()) {
    // Graceful degradation: return false but don't throw
    return false
  }

  try {
    const serialized = JSON.stringify(value)
    await client.setex(key, ttlSeconds, serialized)
    logCache('set', key, ttlSeconds)
    return true
  } catch (error) {
    // Log but don't throw
    console.warn(`[Cache] Error setting key "${key}":`, error instanceof Error ? error.message : error)
    logCache('error', key)
    return false
  }
}

/**
 * Delete cached value
 * Supports pattern matching for bulk invalidation
 */
export async function deleteCache(key: string | string[]): Promise<boolean> {
  const client = getRedisClient()
  
  if (!client || !isRedisConnected()) {
    return false
  }

  try {
    if (Array.isArray(key)) {
      // Delete multiple keys
      if (key.length === 0) return true
      await client.del(...key)
      key.forEach(k => logCache('delete', k))
    } else {
      // Single key or pattern
      if (key.includes('*')) {
        // Pattern matching
        const keys = await client.keys(key)
        if (keys.length > 0) {
          await client.del(...keys)
          keys.forEach(k => logCache('delete', k))
        }
      } else {
        // Single key
        await client.del(key)
        logCache('delete', key)
      }
    }
    return true
  } catch (error) {
    console.warn(`[Cache] Error deleting key "${key}":`, error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Invalidate cache by prefix
 * Useful for invalidating all related cache entries
 * Example: invalidateCachePrefix('leads:') invalidates all lead caches
 */
export async function invalidateCachePrefix(prefix: string): Promise<boolean> {
  return deleteCache(`${prefix}*`)
}

/**
 * Cache helper for async functions
 * Automatically caches function results
 * 
 * Example:
 *   const getLeads = cacheFunction(
 *     async (filters) => fetchLeadsFromDB(filters),
 *     (filters) => `leads:${JSON.stringify(filters)}`,
 *     CACHE_TTL.MEDIUM
 *   )
 */
export function cacheFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyGenerator: (...args: Parameters<T>) => string,
  ttl: number = CACHE_TTL.MEDIUM
): T {
  return (async (...args: Parameters<T>) => {
    const cacheKey = keyGenerator(...args)
    
    // Try cache first
    const cached = await getCache(cacheKey)
    if (cached !== null) {
      return cached
    }

    // Cache miss - execute function
    const result = await fn(...args)
    
    // Cache result
    await setCache(cacheKey, result, ttl)
    
    return result
  }) as T
}

/**
 * Performance logging helper
 */
function logCache(operation: 'hit' | 'miss' | 'set' | 'delete' | 'error', key: string, ttl?: number): void {
  if (process.env.NODE_ENV === 'development' || process.env.ENABLE_CACHE_LOGS === 'true') {
    const ttlStr = ttl ? ` (TTL: ${ttl}s)` : ''
    console.log(`[Cache ${operation.toUpperCase()}] ${key}${ttlStr}`)
  }
}

/**
 * Get cache statistics (for monitoring)
 */
export async function getCacheStats(): Promise<{
  connected: boolean
  keys: number
  memory: string | null
}> {
  const client = getRedisClient()
  
  if (!client || !isRedisConnected()) {
    return { connected: false, keys: 0, memory: null }
  }

  try {
    const [keys, memory] = await Promise.all([
      client.dbsize(),
      client.info('memory').catch(() => null),
    ])

    return {
      connected: true,
      keys,
      memory: memory ? 'available' : null,
    }
  } catch (error) {
    return { connected: false, keys: 0, memory: null }
  }
}
