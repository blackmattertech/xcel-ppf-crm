/**
 * Optional structured timing for API routes (enable with LOG_API_TIMING=1 or in development).
 */

const shouldLog = () =>
  process.env.LOG_API_TIMING === '1' || process.env.NODE_ENV === 'development'

export function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return 0
  }
}

export function logRouteTiming(
  label: string,
  startedAtMs: number,
  payload?: unknown
): void {
  if (!shouldLog()) return
  const ms = Math.round(performance.now() - startedAtMs)
  const bytes = payload !== undefined ? jsonByteLength(payload) : 0
  console.info(
    `[api-timing] ${label} ${ms}ms${bytes ? ` json~${bytes}B` : ''}`
  )
}
