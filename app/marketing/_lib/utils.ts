/** Shared utils for marketing (Bulk WhatsApp, Chat, Templates). */

/** True if two template names are likely the same (e.g. typo: welcom vs welcome). */
export function templateNameSimilar(a: string, b: string): boolean {
  const x = a.toLowerCase().trim()
  const y = b.toLowerCase().trim()
  if (x === y) return true
  const lenDiff = Math.abs(x.length - y.length)
  if (lenDiff > 1) return false
  if (x.length === y.length) {
    let diff = 0
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++
    return diff <= 1
  }
  const [short, long] = x.length < y.length ? [x, y] : [y, x]
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true
  }
  return false
}

export const META_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'en_US', name: 'English (US)' },
  { code: 'en_GB', name: 'English (UK)' },
  { code: 'en_IN', name: 'English (India)' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'ur', name: 'Urdu' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'es', name: 'Spanish' },
  { code: 'es_ES', name: 'Spanish (Spain)' },
  { code: 'es_MX', name: 'Spanish (Mexico)' },
  { code: 'pt_BR', name: 'Portuguese (Brazil)' },
  { code: 'pt_PT', name: 'Portuguese (Portugal)' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ar', name: 'Arabic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh_CN', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
]

export function getLanguageName(code: string): string {
  return META_LANGUAGES.find((l) => l.code === code || l.code.replace('_', '') === code?.replace('_', ''))?.name ?? code
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').trim()
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const num = normalizePhone(phone)
  if (!num) return ''
  const params = new URLSearchParams()
  if (text.trim()) params.set('text', text.trim())
  const q = params.toString()
  return `https://wa.me/${num}${q ? `?${q}` : ''}`
}

/** For chat: last 10 digits for display/match. */
export function normalizePhoneForChat(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

/** Normalize phone for storage/DB (E.164-ish). */
export function normalizePhoneForStorage(phone: string, defaultCountryCode = '91'): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 10) return defaultCountryCode + digits.slice(-10)
  return digits
}
