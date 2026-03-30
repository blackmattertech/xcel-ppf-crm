/** Shared with upload-media and signed-url: allowed types + MIME inference for large uploads (bypass Vercel body limits). */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/x-m4v', 'video/3gpp', 'video/quicktime']
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
]
export const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES]

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  mov: 'video/quicktime',
}

export function normalizeMime(mime: string): string {
  return (mime || '').split(';')[0].trim().toLowerCase()
}

export function inferMimeFromFileName(fileName: string): string | null {
  const m = fileName.trim().match(/\.([a-z0-9]+)$/i)
  const ext = m?.[1]?.toLowerCase()
  return ext ? EXT_TO_MIME[ext] ?? null : null
}

export function resolveUploadMime(rawMime: string, fileName?: string): string | null {
  const m = normalizeMime(rawMime)
  const inferred = fileName ? inferMimeFromFileName(fileName) : null
  if (m && ALLOWED_TYPES.includes(m)) return m
  if (inferred && ALLOWED_TYPES.includes(inferred)) return inferred
  if ((m === 'application/octet-stream' || !m) && inferred) return inferred
  return null
}

export function getExtensionForSignedUrl(mime: string, fileName?: string): string {
  const ext = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (ext) return ext
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/x-m4v': 'm4v',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
  }
  return map[mime] ?? 'bin'
}
