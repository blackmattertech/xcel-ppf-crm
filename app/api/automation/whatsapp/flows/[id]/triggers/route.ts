import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { canManageAutomation } from '@/backend/services/whatsapp-automation-auth'
import { getFlowById, replaceFlowTriggers } from '@/backend/services/whatsapp-automation.service'
import { z } from 'zod'

const triggerSchema = z.object({
  day_offset: z.number().int().min(0).max(29),
  message_type: z.enum(['template', 'text', 'image', 'video']),
  template_id: z.string().uuid().optional().nullable(),
  body_parameters: z.array(z.string()).optional().nullable(),
  header_parameters: z.array(z.string()).optional().nullable(),
  message_body: z.string().max(4096).optional().nullable(),
  media_url: z.string().url().optional().nullable(),
  media_mime_type: z.string().max(100).optional().nullable(),
  media_file_name: z.string().max(255).optional().nullable(),
  media_meta_id: z.string().max(255).optional().nullable(),
})

const bodySchema = z.object({
  triggers: z.array(triggerSchema),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canManageAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const flow = await getFlowById(id)
    if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 })

    const body = await request.json()
    const validated = bodySchema.parse(body)
    const triggers = await replaceFlowTriggers(id, validated.triggers)
    return NextResponse.json({ triggers })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save triggers' },
      { status: 500 }
    )
  }
}
