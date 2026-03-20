/**
 * Redis Connection Singleton
 * 
 * Provides a centralized Redis connection that:
 * - Reuses singleton connection across requests
 * - Handles reconnection automatically
 * - Works in serverless (Next.js) and dev mode
 * - Gracefully degrades if Redis is unavailable
 * 
 * Supports both Upstash (REST API) and standard Redis connections
 */

import Redis from 'ioredis'

let redisClient: Redis | null = null
let isRedisAvailable = false

/**
 * Get or create Redis connection singleton
 * Returns null if Redis is unavailable (graceful degradation)
 */
export function getRedisClient(): Redis | null {
  // Return existing connection if available
  if (redisClient && isRedisAvailable) {
    return redisClient
  }

  // Check if Redis is configured
  // Priority: REDIS_URL > Upstash REST variables
  const redisUrl = process.env.REDIS_URL
  const redisToken = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

  // If using Upstash REST variables, we need to convert to Redis protocol URL
  // Upstash provides REST API (https://) but ioredis needs Redis protocol (rediss://)
  if (!redisUrl && process.env.UPSTASH_REDIS_REST_URL) {
    console.warn(
      '[Redis] UPSTASH_REDIS_REST_URL detected, but ioredis requires Redis protocol URL.\n' +
      'Please use the Redis protocol URL from Upstash console (not REST API URL).\n' +
      'In Upstash dashboard, switch to "Redis" tab (not "REST" tab) to get the correct URL.\n' +
      'Format: rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379'
    )
    return null
  }

  if (!redisUrl) {
    // Redis not configured - app continues without caching
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Redis] REDIS_URL not configured. Running without cache.')
    }
    return null
  }

  try {
    // Parse Redis URL for connection options
    const isUpstash = redisUrl.includes('upstash.io')
    const isTLS = redisUrl.startsWith('rediss://')

    const options: any = {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        // Exponential backoff: 50ms, 100ms, 200ms, 400ms, max 3s
        const delay = Math.min(times * 50, 3000)
        return delay
      },
      reconnectOnError: (err: Error) => {
        // Reconnect on specific errors
        const targetErrors = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
        if (targetErrors.some(e => err.message.includes(e))) {
          return true
        }
        return false
      },
      enableOfflineQueue: false, // Don't queue commands when disconnected
    }

    // TLS configuration for Upstash (uses rediss://)
    if (isTLS) {
      options.tls = {
        rejectUnauthorized: false, // Upstash uses self-signed certificates
      }
    }

    // If password is not in URL and we have a token, use it
    // Note: For Upstash, password should be in the URL itself
    // Format: rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379
    if (redisToken && !redisUrl.includes('@')) {
      // Only use token if URL doesn't already have credentials
      options.password = redisToken
    }

    // Create new Redis client
    redisClient = new Redis(redisUrl, options)

    // Set up event handlers
    redisClient.on('connect', () => {
      isRedisAvailable = true
      if (process.env.NODE_ENV === 'development') {
        console.log('[Redis] Connected successfully')
      }
    })

    redisClient.on('ready', () => {
      isRedisAvailable = true
    })

    redisClient.on('error', (err) => {
      isRedisAvailable = false
      // Log error but don't crash
      console.warn('[Redis] Connection error:', err.message)
    })

    redisClient.on('close', () => {
      isRedisAvailable = false
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Redis] Connection closed')
      }
    })

    redisClient.on('reconnecting', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Redis] Reconnecting...')
      }
    })

    // Test connection
    redisClient.ping().then(() => {
      isRedisAvailable = true
    }).catch(() => {
      isRedisAvailable = false
    })

    return redisClient
  } catch (error) {
    console.error('[Redis] Failed to create client:', error)
    isRedisAvailable = false
    return null
  }
}

/**
 * Check if Redis is currently available
 */
export function isRedisConnected(): boolean {
  return isRedisAvailable && redisClient?.status === 'ready'
}

/**
 * Gracefully close Redis connection
 * Useful for cleanup in serverless environments
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit()
      redisClient = null
      isRedisAvailable = false
    } catch (error) {
      console.warn('[Redis] Error closing connection:', error)
    }
  }
}
