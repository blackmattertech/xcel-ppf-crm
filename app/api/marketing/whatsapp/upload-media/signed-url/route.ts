import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

const BUCKET_TEMPLATE_MEDIA = 'template-media'
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/x-m4v']
const ALLOWED_DOCUMENT_TYPES = ['application/pdf']
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES]

function normalizeMime(mime: string): string {
  return (mime || '').split(';')[0].trim().toLowerCase()
}

function getExtension(mime: string, fileName?: string): string {
  const ext = fileName?.match(/\.(jpe?g|png|gif|webp|mp4|m4v|pdf)$/i)?.[1]?.toLowerCase()
  if (ext) return ext
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/x-m4v': 'm4v',
    'application/pdf': 'pdf',
  }
  return map[mime] ?? 'bin'
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const body = await request.json().catch(() => null) as { fileName?: string; mimeType?: string } | null
  const fileName = (body?.fileName || '').trim()
  const mimeType = normalizeMime(body?.mimeType || '')

  if (!fileName || !mimeType || !ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json(
      {
        error: 'Invalid payload. Expected { fileName, mimeType } with supported mime type.',
        allowed: ALLOWED_TYPES,
      },
      { status: 400 }
    )
  }

  const userId = authResult.user.id
  const path = `${userId}/${crypto.randomUUID()}.${getExtension(mimeType, fileName)}`

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(BUCKET_TEMPLATE_MEDIA)
    .createSignedUploadUrl(path)

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
