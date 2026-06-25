import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { respondToFailedCallWhatsAppPrompt } from '@/backend/services/mcube-failed-call-whatsapp.service'
import { z } from 'zod'

const bodySchema = z.object({
  action: z.enum(['approve', 'dismiss']),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { id } = await params
    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const result = await respondToFailedCallWhatsAppPrompt({
      promptId: id,
      userId: authResult.user.id,
      action: parsed.data.action,
    })

    if (!result.ok) {
      const status = result.error === 'Forbidden' ? 403 : result.error === 'Prompt not found' ? 404 : 400
      return NextResponse.json({ error: result.error ?? 'Failed to respond' }, { status })
    }

    return NextResponse.json({
      success: true,
      sent: result.sent ?? false,
      error: result.error ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to respond' },
      { status: 500 }
    )
  }
}
