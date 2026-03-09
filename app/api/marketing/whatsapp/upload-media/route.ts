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

function getExtension(mime: string, fileName?: string): string {
  const ext = fileName?.match(/\.(jpe?g|png|gif|webp|mp4|m4v|pdf)$/i)?.[1]?.toLowerCase()
  if (ext) return ext
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/x-m4v': 'm4v', 'application/pdf': 'pdf',
  }
  return map[mime] ?? 'bin'
}

/**
 * POST – Upload image/video/document for template header.
 * 1) Uploads to Meta (returns handle for template creation/submit).
 * 2) Uploads to Supabase Storage (template-media bucket) and returns public URL for sending.
 * Body: multipart/form-data with "file" field.
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

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
      { status: 400 }
    )
  }

  const allowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES]
  const mime = (file.type || '').split(';')[0].trim().toLowerCase()
  if (!mime || !allowed.includes(mime)) {
    return NextResponse.json(
      {
        error: 'Unsupported file type. Use image (JPEG/PNG/GIF/WebP), video (MP4), or PDF.',
        allowed: allowed,
      },
      { status: 400 }
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 400 }
    )
  }

  const fileName = (file.name || '').trim() || undefined
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
    const ext = getExtension(mime, fileName)
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: storageError } = await supabase.storage
      .from(BUCKET_TEMPLATE_MEDIA)
      .upload(path, buffer, {
        contentType: mime,
        upsert: false,
      })
    if (!storageError) {
      const { data: urlData } = supabase.storage.from(BUCKET_TEMPLATE_MEDIA).getPublicUrl(path)
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
