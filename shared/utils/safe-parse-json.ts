/**
 * Safely parse a fetch Response body as JSON without throwing on empty or invalid body.
 * Reads the body once via res.text(), then parses. Use this to avoid consuming the
 * body twice and to handle empty/HTML error responses that would make res.json() throw.
 */
export async function safeParseJsonResponse<T>(
  res: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await res.text()
  if (!text || text.trim() === '') {
    return { ok: false, error: 'Empty response' }
  }
  try {
    const data = JSON.parse(text) as T
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}
