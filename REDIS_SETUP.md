# Redis Integration Guide

This CRM now includes Redis integration for caching, rate limiting, and background job processing. The system gracefully degrades if Redis is unavailable, ensuring your app continues to work.

## Features

- ✅ **Caching Layer**: Redis caching for expensive queries (analytics, leads, dashboard)
- ✅ **Rate Limiting**: IP-based rate limiting for login and bulk operations
- ✅ **Background Jobs**: Queue system for async processing (emails, webhooks, analytics)
- ✅ **Graceful Degradation**: App continues working if Redis is unavailable
- ✅ **Production Ready**: Optimized for serverless and traditional deployments

## Setup

### 1. Get Free Redis

Choose one of these free Redis providers:

#### Option A: Upstash (Recommended for Serverless)
1. Go to https://upstash.com/
2. Sign up for free account
3. Create a Redis database
4. Copy the REST URL and token

#### Option B: Redis Cloud
1. Go to https://redis.com/try-free/
2. Sign up for free tier (30MB)
3. Create a database
4. Copy the connection URL

#### Option C: Railway
1. Go to https://railway.app/
2. Create a new project
3. Add Redis service
4. Copy the connection URL

### 2. Configure Environment Variables

Add to your `.env.local`:

```env
# Redis Configuration
REDIS_URL=redis://default:your_password@your_redis_host:6379

# For Upstash, you can also use:
REDIS_TOKEN=your_upstash_token
```

**Upstash Format:**
```
REDIS_URL=redis://default:your_token@your_endpoint.upstash.io:6379
```

**Redis Cloud Format:**
```
REDIS_URL=redis://default:your_password@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345
```

### 3. Install Dependencies

Dependencies are already installed:
- `ioredis` - Redis client
- `bullmq` - Job queue system

## Usage

### Caching

The caching system is automatically integrated into key endpoints:

```typescript
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache'

// In your API route
const cacheKey = `${CACHE_KEYS.LEADS_LIST}:${JSON.stringify(filters)}`
const cached = await getCache(cacheKey)
if (cached) return NextResponse.json(cached)

// Fetch from database
const data = await fetchFromDB()

// Cache for 30 seconds
await setCache(cacheKey, data, CACHE_TTL.SHORT)
```

**Cache Invalidation:**
```typescript
import { invalidateLeadCaches } from '@/lib/cache-invalidation'

// After creating/updating/deleting a lead
await invalidateLeadCaches(leadId)
```

### Rate Limiting

Rate limiting is already integrated into:
- `/api/auth/login` - 10 requests per 10 seconds
- `/api/leads/bulk-upload` - 3 requests per minute

To add rate limiting to other endpoints:

```typescript
import { rateLimitWrapper, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitResponse = await rateLimitWrapper(request, RATE_LIMITS.API_GENERAL)
  if (rateLimitResponse) return rateLimitResponse
  
  // Your handler code
}
```

### Background Jobs

Add jobs to queue (returns immediately):

```typescript
import { addJob, QUEUE_NAMES } from '@/lib/queue'

// Add email job
await addJob(QUEUE_NAMES.EMAIL, {
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Welcome to our CRM!',
})

// Add webhook job
await addJob(QUEUE_NAMES.WEBHOOK, {
  url: 'https://example.com/webhook',
  payload: { event: 'lead.created', data: lead },
})
```

Setup workers (in a separate process or at app startup):

```typescript
import { setupAllWorkers } from '@/lib/queue-workers'

// Initialize workers
setupAllWorkers()
```

## Cache Keys

Predefined cache key prefixes:

- `lead:*` - Individual lead caches
- `leads:list:*` - Lead list queries
- `customer:*` - Customer caches
- `analytics:*` - Analytics data
- `dashboard:*` - Dashboard metrics
- `user:*` - User data
- `product:*` - Product data

## Cache TTL

Default TTL values:

- `CACHE_TTL.SHORT` - 30 seconds (frequently changing data)
- `CACHE_TTL.MEDIUM` - 60 seconds (moderately stable)
- `CACHE_TTL.LONG` - 120 seconds (relatively stable)
- `CACHE_TTL.VERY_LONG` - 300 seconds (very stable)

## Rate Limits

Predefined rate limits:

- `RATE_LIMITS.LOGIN` - 10 requests / 10 seconds
- `RATE_LIMITS.BULK_OPERATIONS` - 5 requests / minute
- `RATE_LIMITS.LEAD_IMPORT` - 3 requests / minute
- `RATE_LIMITS.API_GENERAL` - 100 requests / minute

## Monitoring

Enable detailed logging:

```env
ENABLE_CACHE_LOGS=true
ENABLE_RATE_LIMIT_LOGS=true
ENABLE_QUEUE_LOGS=true
```

Check cache stats:

```typescript
import { getCacheStats } from '@/lib/cache'

const stats = await getCacheStats()
console.log(stats) // { connected: true, keys: 150, memory: 'available' }
```

## Performance Impact

### With Redis:
- **Analytics queries**: ~50-200ms (cached) vs 500-2000ms (uncached)
- **Lead lists**: ~10-50ms (cached) vs 100-500ms (uncached)
- **Rate limiting**: Prevents abuse, protects endpoints
- **Background jobs**: Non-blocking, improves API response times

### Without Redis:
- App continues working normally
- All queries go directly to database
- No rate limiting (requests allowed through)
- No background job processing

## Production Considerations

1. **Separate Worker Process**: Run queue workers in a separate process/container
2. **Redis Persistence**: Enable persistence for production Redis instances
3. **Monitoring**: Set up Redis monitoring (memory usage, connections)
4. **Scaling**: Use Redis Cluster for high availability
5. **Backup**: Regular Redis backups for critical data

## Troubleshooting

### Redis Connection Issues

If Redis is unavailable:
- App continues working (graceful degradation)
- Check `REDIS_URL` format
- Verify Redis instance is running
- Check network/firewall settings

### Cache Not Working

- Verify Redis connection: Check logs for `[Redis] Connected successfully`
- Check cache keys: Use Redis CLI to inspect keys
- Verify TTL: Keys expire automatically

### Rate Limiting Too Strict

Adjust limits in `lib/rate-limit.ts`:
```typescript
export const RATE_LIMITS = {
  LOGIN: {
    maxRequests: 20, // Increase from 10
    windowSeconds: 10,
  },
}
```

## Architecture

```
┌─────────────┐
│   Next.js   │
│   API Route │
└──────┬──────┘
       │
       ├───► Redis Cache ──► Check cache ──► Return cached or fetch DB
       │
       ├───► Rate Limiter ──► Check limit ──► Allow or 429
       │
       └───► Queue ──► Add job ──► Worker processes async
```

## Next Steps

1. Set up Redis instance (Upstash recommended)
2. Add `REDIS_URL` to environment variables
3. Deploy and monitor cache hit rates
4. Adjust TTL values based on your data patterns
5. Set up queue workers for background processing

For questions or issues, check the code comments in:
- `lib/redis.ts` - Connection management
- `lib/cache.ts` - Caching functions
- `lib/rate-limit.ts` - Rate limiting
- `lib/queue.ts` - Job queue system
