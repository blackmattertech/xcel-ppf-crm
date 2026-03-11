/**
 * Frontend API client: in-memory cache + in-flight request deduplication.
 * Same API called multiple times → one network request; response reused from cache.
 * Use for GET (and read-only POST) to avoid duplicate calls and speed up UI.
 */

const inFlight = new Map<string, Promise<Response>>()
const cache = new Map<string, { data: unknown; expiresAt: number }>()

const DEFAULT_TTL_MS = 30_000 // 30 seconds

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return String(h)
}

function getCacheKey(url: string, options?: RequestInit): string {
  const method = (options?.method || 'GET').toUpperCase()
  if (method === 'GET') return `GET:${url}`
  const body = options?.body
  if (body == null) return `${method}:${url}`
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  return `${method}:${url}:${hashString(bodyStr)}`
}

/**
 * Whether to cache the response. Only GET is cached by default; mutations (POST/PUT/DELETE)
 * use ttlMs from options (default 0 for non-GET).
 */
function getTtlMs(method: string, ttlMs?: number): number {
  if (typeof ttlMs === 'number') return ttlMs
  return method === 'GET' ? DEFAULT_TTL_MS : 0
}

/**
 * Build a response-like object that supports multiple .json()/.text() calls.
 * Used when deduplicating in-flight requests so all waiters can read the body
 * without "Body has already been consumed".
 */
function responseLike(res: Response, data: unknown, _isJson: boolean): Response {
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    clone: () => responseLike(res, data, _isJson),
  } as Response
}

/**
 * Fetch with frontend cache and in-flight deduplication.
 * - Same key (url + method + body for POST) while a request is in flight → same Promise (one network call).
 * - After success, response is cached in memory; next identical call within TTL returns cached response.
 *
 * @param url Request URL
 * @param options Standard fetch options
 * @param ttlMs Cache TTL in ms. GET default 30s; POST/PUT/DELETE default 0 (no cache). Pass 0 to disable cache.
 */
export async function cachedFetch(
  url: string,
  options?: RequestInit,
  ttlMs?: number
): Promise<Response> {
  const method = (options?.method || 'GET').toUpperCase()
  const key = getCacheKey(url, options)
  const ttl = getTtlMs(method, ttlMs)

  // 1. Return cached result if valid
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    const body = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)
    return new Response(body, {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  // 2. Dedupe in-flight: same key → same Promise
  let promise = inFlight.get(key)
  if (promise) return promise

  promise = (async () => {
    try {
      const res = await fetch(url, options)
      const clone = res.clone()
      let data: unknown
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        data = await clone.json().catch(() => null)
      } else {
        data = await clone.text().catch(() => '')
      }
      if (res.ok && ttl > 0) {
        cache.set(key, { data, expiresAt: Date.now() + ttl })
      }
      // Return a response-like object that supports multiple .json()/.text() calls
      // so in-flight deduplication doesn't cause "Body has already been consumed"
      // when multiple callers share the same Promise<Response>.
      return responseLike(res, data, contentType.includes('application/json'))
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  return promise
}

/**
 * Invalidate cached response(s) for a URL pattern (e.g. after a mutation).
 * Call after create/update/delete so next GET returns fresh data.
 * Pattern can be exact key (e.g. "GET:/api/leads") or prefix (e.g. "GET:/api/leads" to clear all leads list variants).
 */
export function invalidateApiCache(urlOrPrefix: string): void {
  const prefix = urlOrPrefix.startsWith('GET:') || urlOrPrefix.startsWith('POST:') ? urlOrPrefix : `GET:${urlOrPrefix}`
  for (const key of cache.keys()) {
    if (key === prefix || key.startsWith(prefix + ':')) {
      cache.delete(key)
    }
  }
}

/**
 * Clear all frontend API cache (e.g. on logout).
 */
export function clearApiCache(): void {
  cache.clear()
}
