# Upstash Redis Setup Guide

## ⚠️ Important: Use Redis Protocol URL, Not REST API URL

Upstash provides **two different connection methods**:

1. **REST API** (`https://`) - For HTTP-based access
2. **Redis Protocol** (`rediss://`) - For standard Redis clients like `ioredis`

**Our implementation uses `ioredis`, which requires the Redis Protocol URL.**

## How to Get the Correct URL

### Step 1: Go to Upstash Console
1. Log in to https://console.upstash.com/
2. Select your Redis database

### Step 2: Switch to "Redis" Tab
- **DO NOT use the "REST" tab** (that's for REST API)
- **Click on the "Redis" tab** instead
- You'll see a URL like: `rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379`

### Step 3: Copy the Redis Protocol URL
The URL should look like:
```
rediss://default:AbCdEf123456@fitting-newt-16554.upstash.io:6379
```

### Step 4: Add to `.env.local`

```env
REDIS_URL="rediss://default:YOUR_PASSWORD@fitting-newt-16554.upstash.io:6379"
```

**Important Notes:**
- Use `rediss://` (with double 's') for TLS/SSL
- The password is embedded in the URL after `default:`
- Keep the URL in quotes if it contains special characters
- **DO NOT use** `UPSTASH_REDIS_REST_URL` - that's for REST API only

## Current Configuration Issue

If you're seeing:
```env
UPSTASH_REDIS_REST_URL="https://fitting-newt-16554.upstash.io"
```

This is the **REST API URL**, which won't work with `ioredis`.

**Fix:** Replace it with:
```env
REDIS_URL="rediss://default:YOUR_PASSWORD@fitting-newt-16554.upstash.io:6379"
```

## Verification

After setting `REDIS_URL` correctly, you should see in your logs:
```
[Redis] Connected successfully
```

If you see connection errors, check:
1. ✅ URL starts with `rediss://` (not `https://`)
2. ✅ Password is included in the URL
3. ✅ Port number is included (`:6379`)
4. ✅ No extra spaces or quotes issues

## Alternative: Using @upstash/redis (Future Option)

If you want to use the REST API instead, you would need to:
1. Install `@upstash/redis` package
2. Rewrite the cache layer to use REST API
3. This is more complex and not currently implemented

**Recommendation:** Stick with the Redis Protocol URL - it's simpler and works with our current implementation.
