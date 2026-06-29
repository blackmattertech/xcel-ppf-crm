/** Escape a single CSV cell (RFC 4180-style). */
export function escapeCsvCell(value: unknown): string {
  const v = String(value ?? '')
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','))
  return lines.join('\n')
}

/** Safe filename fragment from bucket name. */
export function slugifyForFilename(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'bucket'
  )
}
