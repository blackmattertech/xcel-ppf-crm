import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { PERMISSIONS } from '@/shared/constants/permissions'

const BUCKET = 'landing-assets'

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const VIDEO_TYPES = ['video/mp4', 'video/webm']
const MAX_IMAGE = 5 * 1024 * 1024
const MAX_VIDEO = 50 * 1024 * 1024

/**
 * Upload hero image, hero video, or section video for the public landing page.
 */
export async function POST(request: NextRequest) {
  const authResult = await requirePermission(request, PERMISSIONS.MARKETING_LANDING_MANAGE)
  if ('error' in authResult) return authResult.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const kind = (formData.get('kind') as string) || 'hero-image'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const isHeroImage = kind === 'hero-image'
    const isHeroVideo = kind === 'hero-video'
    const isSectionVideo = kind === 'section-video'

    if (!isHeroImage && !isHeroVideo && !isSectionVideo) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }

    let maxSize: number
    let allowed: string[]
    let prefix: string
    if (isHeroImage) {
      allowed = IMAGE_TYPES
      maxSize = MAX_IMAGE
      prefix = 'hero-img'
    } else {
      allowed = VIDEO_TYPES
      maxSize = MAX_VIDEO
      prefix = isHeroVideo ? 'hero-vid' : 'section-vid'
    }

    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type for ${kind}. Allowed: ${allowed.join(', ')}` },
        { status: 400 }
      )
    }

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(maxSize / (1024 * 1024))}MB)` },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'bin'
    const fileName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
        return NextResponse.json(
          {
            error: `Storage bucket "${BUCKET}" not found. Create it in Supabase (Storage) or run migration 040.`,
            bucketName: BUCKET,
          },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)

    return NextResponse.json({
      url: urlData.publicUrl,
      path: uploadData.path,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
