import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import {
  ensureTemplateMediaBucket,
  TEMPLATE_MEDIA_BUCKET,
} from '@/lib/supabase/ensure-template-media-bucket'
import {
  ALLOWED_TYPES,
  normalizeMime,
  resolveUploadMime,
  getExtensionForSignedUrl,
} from '@/app/marketing/_lib/whatsapp-upload-mime'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const body = await request.json().catch(() => null) as { fileName?: string; mimeType?: string } | null
  const fileName = (body?.fileName || '').trim()
  const rawMime = normalizeMime(body?.mimeType || '')
  const mimeType = resolveUploadMime(rawMime, fileName || undefined)

  if (!fileName || !mimeType || !ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json(
      {
        error: 'Invalid payload. Expected { fileName, mimeType } with a supported type (or a known file extension).',
        allowed: ALLOWED_TYPES,
      },
      { status: 400 }
    )
  }

  const userId = authResult.user.id
  const path = `${userId}/${crypto.randomUUID()}.${getExtensionForSignedUrl(mimeType, fileName)}`

  const supabase = createServiceClient()
  const ensured = await ensureTemplateMediaBucket(supabase)
  if (!ensured.ok) {
    return NextResponse.json(
      { error: ensured.error || 'WhatsApp media storage bucket is not available' },
      { status: 503 }
    )
  }

  const { data, error } = await supabase.storage.from(TEMPLATE_MEDIA_BUCKET).createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create signed upload URL' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  })
}
