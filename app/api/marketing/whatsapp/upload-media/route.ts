import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { uploadMediaBufferToMeta } from '@/backend/services/whatsapp.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'
import { createServiceClient } from '@/lib/supabase/service'

/** Create in Supabase Dashboard → Storage → New bucket → name "template-media" → Public bucket. */
const BUCKET_TEMPLATE_MEDIA = 'template-media'
const MAX_FILE_SIZE = 16 * 1024 * 1024 // 16 MB (Meta limit for template media)
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/x-m4v']
const ALLOWED_DOCUMENT_TYPES = ['application/pdf']
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES]

function getExtension(mime: string, fileName?: string): string {
  const ext = fileName?.match(/\.(jpe?g|png|gif|webp|mp4|m4v|pdf)$/i)?.[1]?.toLowerCase()
  if (ext) return ext
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/x-m4v': 'm4v', 'application/pdf': 'pdf',
  }
  return map[mime] ?? 'bin'
}

function normalizeMime(mime: string): string {
  return (mime || '').split(';')[0].trim().toLowerCase()
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
    mime = normalizeMime(body?.mimeType || '')
    fileName = (body?.fileName || '').trim() || undefined
    if (!safePath || !mime || !ALLOWED_TYPES.includes(mime)) {
      return NextResponse.json(
        {
          error: 'Invalid JSON payload. Expected { storagePath, mimeType, fileName? } with supported mime type.',
          allowed: ALLOWED_TYPES,
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
    mime = normalizeMime(file.type)
    if (!mime || !ALLOWED_TYPES.includes(mime)) {
      return NextResponse.json(
        {
          error: 'Unsupported file type. Use image (JPEG/PNG/GIF/WebP), video (MP4), or PDF.',
          allowed: ALLOWED_TYPES,
        },
        { status: 400 }
      )
    }
    fileName = (file.name || '').trim() || undefined
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
      { error: `File too large for WhatsApp template upload. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
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
