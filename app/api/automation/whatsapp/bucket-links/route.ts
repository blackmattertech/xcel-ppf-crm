import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { canEnrollAutomation, canReadAutomation } from '@/backend/services/whatsapp-automation-auth'
import {
  linkBucketToFlow,
  listBucketLinks,
  unlinkBucketFromFlow,
} from '@/backend/services/whatsapp-automation.service'
import { z } from 'zod'

const linkSchema = z.object({
  flow_id: z.string().uuid(),
  bucket_id: z.string().uuid(),
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

    const { searchParams } = new URL(request.url)
    const bucketId = searchParams.get('bucketId') ?? undefined
    const flowId = searchParams.get('flowId') ?? undefined
    const activeOnly = searchParams.get('active_only') !== 'false'

    const links = await listBucketLinks({ bucketId, flowId, activeOnly })
    return NextResponse.json({ links })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list bucket links' },
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
    if (!canEnrollAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validated = linkSchema.parse(body)
    const link = await linkBucketToFlow(validated.flow_id, validated.bucket_id, user.id)
    return NextResponse.json(link, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to link bucket' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canEnrollAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const flowId = searchParams.get('flowId')
    const bucketId = searchParams.get('bucketId')
    if (!flowId || !bucketId) {
      return NextResponse.json({ error: 'flowId and bucketId required' }, { status: 400 })
    }

    await unlinkBucketFromFlow(flowId, bucketId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unlink bucket' },
      { status: 500 }
    )
  }
}
