/**
 * Redis-based Rate Limiting Middleware
 * 
 * Protects endpoints from abuse by limiting requests per IP
 * Uses sliding window algorithm for accurate rate limiting
 * 
 * Features:
 * - IP-based rate limiting
 * - Configurable limits and windows
 * - Graceful degradation if Redis unavailable
 * - Proper HTTP 429 responses
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRedisClient, isRedisConnected } from './redis'

export interface RateLimitOptions {
  /**
   * Maximum number of requests allowed
   */
  maxRequests: number
  
  /**
   * Time window in seconds
   */
  windowSeconds: number
  
  /**
   * Custom identifier function (default: uses IP address)
   */
  identifier?: (request: NextRequest) => string
  
  /**
   * Custom error message
   */
  errorMessage?: string
  
  /**
   * Whether to skip rate limiting if Redis is unavailable
   * Default: true (allows requests through if Redis down)
   */
  skipOnRedisUnavailable?: boolean
}

/**
 * Default rate limit configurations
 */
export const RATE_LIMITS = {
  LOGIN: {
    maxRequests: 10,
    windowSeconds: 10, // 10 requests per 10 seconds
  },
  BULK_OPERATIONS: {
    maxRequests: 5,
    windowSeconds: 60, // 5 requests per minute
  },
  API_GENERAL: {
    maxRequests: 100,
    windowSeconds: 60, // 100 requests per minute
  },
  LEAD_IMPORT: {
    maxRequests: 3,
    windowSeconds: 60, // 3 imports per minute
  },
} as const

/**
 * Get client identifier from request
 * Uses IP address or X-Forwarded-For header
 */
function getClientIdentifier(request: NextRequest): string {
  // Try X-Forwarded-For first (for proxies/load balancers)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take first IP if multiple
    return forwardedFor.split(',')[0].trim()
  }

  // Fallback to X-Real-IP
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Last resort: use a default identifier
  // In production, you might want to use a session ID or user ID
  return 'unknown'
}

/**
 * Rate limit middleware
 * Returns null if request should proceed, or NextResponse with 429 if rate limited
 */
export async function rateLimit(
  request: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const client = getRedisClient()
  
  // If Redis unavailable and skipOnRedisUnavailable is true, allow request
  if (!client || !isRedisConnected()) {
    if (options.skipOnRedisUnavailable !== false) {
      // Graceful degradation: allow request through
      if (process.env.NODE_ENV === 'development') {
        console.warn('[RateLimit] Redis unavailable, allowing request through')
      }
      return null
    }
    // If explicitly set to false, deny when Redis unavailable
    return NextResponse.json(
      { error: 'Rate limiting service unavailable' },
      { status: 503 }
    )
  }

  try {
    const identifier = options.identifier 
      ? options.identifier(request)
      : getClientIdentifier(request)
    
    const key = `ratelimit:${identifier}`
    const window = options.windowSeconds
    const maxRequests = options.maxRequests

    // Get current count
    const current = await client.get(key)
    const count = current ? parseInt(current, 10) : 0

    if (count >= maxRequests) {
      // Rate limit exceeded
      const ttl = await client.ttl(key)
      const retryAfter = ttl > 0 ? ttl : window
      
      logRateLimit('limited', identifier, count, maxRequests, retryAfter)
      
      return NextResponse.json(
        {
          error: options.errorMessage || 'Too many requests',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': (Date.now() + retryAfter * 1000).toString(),
          },
        }
      )
    }

    // Increment counter
    if (count === 0) {
      // First request in window - set with TTL
      await client.setex(key, window, '1')
    } else {
      // Increment existing counter
      await client.incr(key)
      // Reset TTL if needed (sliding window)
      await client.expire(key, window)
    }

    const remaining = Math.max(0, maxRequests - count - 1)
    logRateLimit('allowed', identifier, count + 1, maxRequests, remaining)

    // Add rate limit headers to response
    // Note: We can't modify the response here, so headers are added in the wrapper
    return null // Request allowed
  } catch (error) {
    // On error, allow request through (fail open)
    console.warn('[RateLimit] Error checking rate limit:', error)
    return null
  }
}

/**
 * Rate limit wrapper for Next.js API routes
 * 
 * Usage:
 *   export async function POST(request: NextRequest) {
 *     const rateLimitResponse = await rateLimitWrapper(request, RATE_LIMITS.LOGIN)
 *     if (rateLimitResponse) return rateLimitResponse
 *     
 *     // Your handler code here
 *   }
 */
export async function rateLimitWrapper(
  request: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  return rateLimit(request, options)
}

/**
 * Performance logging
 */
function logRateLimit(
  action: 'allowed' | 'limited',
  identifier: string,
  count: number,
  max: number,
  remainingOrRetry: number
): void {
  if (process.env.NODE_ENV === 'development' || process.env.ENABLE_RATE_LIMIT_LOGS === 'true') {
    if (action === 'limited') {
      console.warn(
        `[RateLimit BLOCKED] ${identifier}: ${count}/${max} requests (retry after ${remainingOrRetry}s)`
      )
    } else {
      console.log(
        `[RateLimit ALLOWED] ${identifier}: ${count}/${max} requests (${remainingOrRetry} remaining)`
      )
    }
  }
}
