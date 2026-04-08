import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/backend/middleware/auth'
import { getLandingPageSettings, upsertLandingPageSettings } from '@/backend/services/landing-page.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { landingFormFieldsArraySchema } from '@/shared/types/landing-form'

const updateSchema = z.object({
  hero_title: z.string().max(2000).optional(),
  hero_subtitle: z.string().max(4000).optional(),
  hero_image_url: z.string().max(2000).nullable().optional().or(z.literal('')),
  hero_video_url: z.string().max(2000).nullable().optional().or(z.literal('')),
  hero_background: z.enum(['image', 'video', 'none']).optional(),
  hero_background_opacity: z.number().int().min(0).max(100).optional(),
  form_section_title: z.string().max(500).optional(),
  form_button_label: z.string().max(200).optional(),
  form_success_message: z.string().max(2000).optional(),
  form_fields: landingFormFieldsArraySchema.optional(),
  video_section_title: z.string().max(500).optional(),
  video_url: z.string().max(2000).optional(),
  video_description: z.string().max(4000).nullable().optional().or(z.literal('')),
})

export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, PERMISSIONS.MARKETING_LANDING_READ)
  if ('error' in authResult) return authResult.error

  try {
    const settings = await getLandingPageSettings()
    return NextResponse.json({ settings })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requirePermission(request, PERMISSIONS.MARKETING_LANDING_MANAGE)
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const parsed = updateSchema.parse(body)

    const patch: Record<string, unknown> = { ...parsed }
    if (parsed.hero_image_url === '') patch.hero_image_url = null
    if (parsed.hero_video_url === '') patch.hero_video_url = null
    if (parsed.video_description === '') patch.video_description = null

    const settings = await upsertLandingPageSettings(patch)
    return NextResponse.json({ settings })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save' },
      { status: 500 }
    )
  }
}
