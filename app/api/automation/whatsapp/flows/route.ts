import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { canManageAutomation, canReadAutomation } from '@/backend/services/whatsapp-automation-auth'
import { countActiveFlows, createFlow, listFlows } from '@/backend/services/whatsapp-automation.service'
import { z } from 'zod'

const createFlowSchema = z.object({
  name: z.string().min(1).max(120),
  cycle_days: z.number().int().min(1).max(30),
  restart_on_complete: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canReadAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const activeOnly = new URL(request.url).searchParams.get('active_only') === 'true'
    const flows = await listFlows({ activeOnly })
    const activeCount = await countActiveFlows()

    return NextResponse.json({ flows, activeCount, maxActive: 2 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list flows' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canManageAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validated = createFlowSchema.parse(body)
    const flow = await createFlow({ ...validated, created_by: user.id })
    return NextResponse.json(flow, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create flow' },
      { status: error instanceof Error && error.message.includes('Maximum') ? 409 : 500 }
    )
  }
}
