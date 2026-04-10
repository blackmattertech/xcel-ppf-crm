/**
 * Parse CSV / Excel rows into the same text lines the bulk-whatsapp "paste" flow expects:
 * one number per line, or "Name, phone" (comma/tab).
 */
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { normalizePhone } from './utils'

export type ParseRecipientFileResult = {
  lines: string[]
  skipped: number
  rowCount: number
}

function rowToLine(name: string, phoneRaw: string): string | null {
  const digits = normalizePhone(phoneRaw)
  if (digits.length < 10) return null
  const n = name.trim()
  if (n && n !== '—' && n !== '-' && n.toLowerCase() !== 'null') return `${n}, ${digits}`
  return digits
}

/** Normalize header for matching: lowercase, underscores/hyphens → spaces, collapse spaces. */
export function normalizeRecipientHeaderKey(k: string): string {
  return k.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * True if this column should be treated as the phone / mobile number field.
 * Supports: numbers, mobile, mobile_number, phone, phone_number (any common separators / case).
 */
export function isPhoneColumnHeader(key: string): boolean {
  const n = normalizeRecipientHeaderKey(key)
  if (!n) return false
  // Exact aliases (after normalization phone_number → "phone number", mobile_number → "mobile number")
  const exact = new Set([
    'numbers',
    'number',
    'mobile',
    'mobile number',
    'phone',
    'phone number',
    'whatsapp',
    'tel',
    'cell',
    'msisdn',
    'contact',
  ])
  if (exact.has(n)) return true
  if (/\b(phone|mobile|whatsapp|tel|cell|msisdn)\b/.test(n)) return true
  return false
}

function isNameColumnHeader(key: string): boolean {
  if (isPhoneColumnHeader(key)) return false
  const n = normalizeRecipientHeaderKey(key)
  if (/\b(name|customer|lead|full name|contact name)\b/.test(n)) return true
  if (n.includes('name') && !n.includes('phone')) return true
  return false
}

function detectPhoneAndNameKeys(sample: Record<string, unknown>): { phoneKey: string; nameKey: string | null } | null {
  const keys = Object.keys(sample).filter((k) => k && !k.startsWith('__'))
  const phoneCandidates = keys.filter((k) => isPhoneColumnHeader(k))
  if (!phoneCandidates.length) return null

  const priority = ['phone number', 'mobile number', 'phone', 'mobile', 'numbers', 'number', 'whatsapp', 'tel', 'cell', 'msisdn', 'contact']
  const score = (k: string) => {
    const nk = normalizeRecipientHeaderKey(k)
    const i = priority.indexOf(nk)
    return i === -1 ? 100 : i
  }
  phoneCandidates.sort((a, b) => score(a) - score(b))
  const phoneKey = phoneCandidates[0]

  let nameKey: string | null = null
  for (const k of keys) {
    if (k === phoneKey) continue
    if (isNameColumnHeader(k)) {
      nameKey = k
      break
    }
  }
  return { phoneKey, nameKey }
}

function objectsToLines(rows: Record<string, unknown>[]): { lines: string[]; skipped: number } {
  const lines: string[] = []
  let skipped = 0
  if (!rows.length) return { lines, skipped }

  const sample =
    rows.find((r) => Object.keys(r).some((k) => String((r as Record<string, unknown>)[k] ?? '').trim())) ?? rows[0]
  const det = detectPhoneAndNameKeys(sample)
  if (det) {
    for (const row of rows) {
      const phone = String(row[det.phoneKey] ?? '')
      const name = det.nameKey ? String(row[det.nameKey] ?? '') : ''
      const line = rowToLine(name, phone)
      if (line) lines.push(line)
      else skipped++
    }
    return { lines, skipped }
  }

  for (const row of rows) {
    const values = Object.values(row)
      .map((v) => String(v ?? '').trim())
      .filter((v) => v && v !== 'undefined')
    if (values.length === 0) {
      skipped++
      continue
    }
    if (values.length === 1) {
      const line = rowToLine('', values[0])
      if (line) lines.push(line)
      else skipped++
      continue
    }
    const a = values[0]
    const b = values[1]
    const da = normalizePhone(a).length
    const db = normalizePhone(b).length
    let line: string | null = null
    if (da >= 10 && db >= 10) {
      line = rowToLine(a, b)
      if (!line) line = rowToLine(b, a)
    } else if (da >= 10) line = rowToLine(b, a)
    else if (db >= 10) line = rowToLine(a, b)
    else line = rowToLine('', da > db ? a : b)
    if (line) lines.push(line)
    else skipped++
  }
  return { lines, skipped }
}

export function parseRecipientsFromCsvText(text: string): ParseRecipientFileResult {
  const trimmed = text.trim()
  if (!trimmed) return { lines: [], skipped: 0, rowCount: 0 }

  const withHeader = Papa.parse<Record<string, unknown>>(trimmed, { header: true, skipEmptyLines: true })
  let rows = (withHeader.data || []).filter((r) => r && Object.keys(r).some((k) => String((r as Record<string, unknown>)[k] ?? '').trim()))
  let { lines, skipped } = objectsToLines(rows as Record<string, unknown>[])

  if (lines.length === 0) {
    const noHeader = Papa.parse<string[]>(trimmed, { header: false, skipEmptyLines: true })
    const arr = (noHeader.data || []).filter((r) => r?.some((c) => String(c ?? '').trim()))
    const fakeRows = arr.map((cells) => {
      const o: Record<string, unknown> = {}
      cells.forEach((c, i) => {
        o[`col${i}`] = c
      })
      return o
    })
    const r2 = objectsToLines(fakeRows)
    lines = r2.lines
    skipped = r2.skipped
    return { lines, skipped, rowCount: arr.length }
  }

  return { lines, skipped, rowCount: rows.length }
}

export function parseRecipientsFromXlsxBuffer(buffer: ArrayBuffer): ParseRecipientFileResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { lines: [], skipped: 0, rowCount: 0 }
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  const filtered = rows.filter((r) => r && Object.keys(r).some((k) => String((r as Record<string, unknown>)[k] ?? '').trim()))
  const { lines, skipped } = objectsToLines(filtered)
  return { lines, skipped, rowCount: filtered.length }
}

/** Sample CSV for bulk upload: includes a `numbers` column (recognized as phone). */
export function getSampleRecipientCsv(): string {
  return [
    'Name,numbers,Email',
    'Jane Doe,919876543210,jane@example.com',
    'Rahul Kumar,919876543211,rahul@example.com',
  ].join('\n')
}

/** Sample XLSX buffer: first column uses `mobile_number` (recognized as phone). */
export function getSampleRecipientXlsxArrayBuffer(): ArrayBuffer {
  const aoa = [
    ['Name', 'mobile_number', 'City'],
    ['Jane Doe', '919876543210', 'Mumbai'],
    ['Rahul Kumar', '9876543210', 'Delhi'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Recipients')
  const u8 = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array
  const sliced = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
  return sliced as ArrayBuffer
}
