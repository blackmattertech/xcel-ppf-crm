import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { uploadMediaBufferToMeta } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { createServiceClient } from '@/lib/supabase/service'

/** Create in Supabase Dashboard → Storage → New bucket → name "template-media" → Public bucket. */
const BUCKET_TEMPLATE_MEDIA = 'template-media'
/** WhatsApp Cloud API document limit is 100 MB; keep same cap for inbox uploads. */
const MAX_FILE_SIZE = 100 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/x-m4v', 'video/3gpp', 'video/quicktime']
const ALLOWED_DOCUMENT_TYPES = [
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
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES]

/** When the browser sends empty/octet-stream MIME, infer from filename for Meta upload. */
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

function normalizeMime(mime: string): string {
  return (mime || '').split(';')[0].trim().toLowerCase()
}

function inferMimeFromFileName(fileName: string): string | null {
  const m = fileName.trim().match(/\.([a-z0-9]+)$/i)
  const ext = m?.[1]?.toLowerCase()
  return ext ? EXT_TO_MIME[ext] ?? null : null
}

function resolveUploadMime(rawMime: string, fileName?: string): string | null {
  const m = normalizeMime(rawMime)
  const inferred = fileName ? inferMimeFromFileName(fileName) : null
  if (m && ALLOWED_TYPES.includes(m)) return m
  if (inferred && ALLOWED_TYPES.includes(inferred)) return inferred
  if ((m === 'application/octet-stream' || !m) && inferred) return inferred
  return null
}

function getExtension(mime: string, fileName?: string): string {
  const ext = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (ext) return ext
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/x-m4v': 'm4v', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip',
  }
  return map[mime] ?? 'bin'
}

function parseStoragePath(raw: string, userId: string): string | null {
  const p = raw.trim().replace(/^\/+/, '')
  if (!p || p.includes('..') || p.startsWith('http')) return null
  if (!p.startsWith(`${userId}/`)) return null
  return p
}

/**
 * POST – Upload image/video/document for template header.
 * 1) Uploads to Meta (returns handle for template creation/submit).
 * 2) Uploads to Supabase Storage (template-media bucket) and returns public URL for sending.
 * Body:
 * - multipart/form-data with "file" field (legacy, may hit Vercel payload limits)
 * - OR JSON { storagePath, mimeType, fileName? } for large files uploaded directly to Supabase first.
 * Returns { handle, id, url } – save handle in header_media_id (Meta Resumable Upload handle only; never a URL),
 * url in header_media_url (for send and submit retry). Submit uses only the handle; send uses the URL.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const { user } = authResult
  const { wabaConfig } = await getResolvedWhatsAppConfig(user.id)
  if (!wabaConfig) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account not configured' },
      { status: 503 }
    )
  }

  const appId = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID
  if (!appId?.trim()) {
    return NextResponse.json(
      { error: 'FACEBOOK_APP_ID or META_APP_ID not set (required for media upload)' },
      { status: 503 }
    )
  }

  let buffer: ArrayBuffer
  let mime = ''
  let fileName: string | undefined
  let storagePath: string | null = null

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => null) as {
      storagePath?: string
      mimeType?: string
      fileName?: string
    } | null
    const safePath = body?.storagePath ? parseStoragePath(body.storagePath, user.id) : null
    fileName = (body?.fileName || '').trim() || undefined
    const rawMime = normalizeMime(body?.mimeType || '')
    mime = resolveUploadMime(rawMime, fileName) ?? ''
    if (!safePath || !mime) {
      return NextResponse.json(
        {
          error: 'Unsupported or unknown file type. Use a common office, image, video, or archive format, or set a correct fileName extension.',
        },
        { status: 400 }
      )
    }
    storagePath = safePath
    const supabase = createServiceClient()
    const { data: signed, error: signedErr } = await supabase.storage
      .from(BUCKET_TEMPLATE_MEDIA)
      .createSignedUrl(storagePath, 60)
    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signedErr?.message || 'Failed to access uploaded file' },
        { status: 400 }
      )
    }
    const download = await fetch(signed.signedUrl, { method: 'GET' })
    if (!download.ok) {
      return NextResponse.json(
        { error: 'Failed to download uploaded file from storage' },
        { status: 400 }
      )
    }
    buffer = await download.arrayBuffer()
  } else {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'Invalid multipart body' },
        { status: 400 }
      )
    }
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing or invalid "file" in form data' },
        { status: 400 }
      )
    }
    fileName = (file.name || '').trim() || undefined
    const resolved = resolveUploadMime(normalizeMime(file.type), fileName)
    if (!resolved) {
      return NextResponse.json(
        {
          error:
            'Unsupported file type. Try office documents (PDF, Word, Excel…), images, or video (MP4). If the browser reports an unknown type, ensure the file has a standard extension.',
        },
        { status: 400 }
      )
    }
    mime = resolved
    try {
      buffer = await file.arrayBuffer()
    } catch {
      return NextResponse.json(
        { error: 'Failed to read file' },
        { status: 400 }
      )
    }
  }

  if (buffer.byteLength > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB (WhatsApp Cloud API limit for documents).` },
      { status: 400 }
    )
  }

  const result = await uploadMediaBufferToMeta(buffer, mime, {
    accessToken: wabaConfig.accessToken,
    appId,
    fileName,
  })

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Upload to Meta failed' },
      { status: 400 }
    )
  }

  let publicUrl: string | null = null
  try {
    const supabase = createServiceClient()
    const path = storagePath ?? `${user.id}/${crypto.randomUUID()}.${getExtension(mime, fileName)}`
    if (!storagePath) {
      await supabase.storage
        .from(BUCKET_TEMPLATE_MEDIA)
        .upload(path, buffer, {
          contentType: mime,
          upsert: false,
        })
    }
    const { data: urlData } = supabase.storage.from(BUCKET_TEMPLATE_MEDIA).getPublicUrl(path)
    if (urlData?.publicUrl) {
      publicUrl = urlData.publicUrl
    }
  } catch {
    // Supabase upload optional; we still have Meta handle
  }

  return NextResponse.json({
    success: true,
    handle: result.handle,
    id: result.handle,
    url: publicUrl ?? undefined,
    message: publicUrl
      ? 'Uploaded to Meta and Supabase. Use url as header_media_url and handle as header_media_id.'
      : 'Uploaded to Meta. For sending, set header_media_url to a public image URL (e.g. Supabase Storage).',
  })
}
