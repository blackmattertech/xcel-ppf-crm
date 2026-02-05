import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { upsertPushToken, deletePushToken } from '@/backend/services/push-token.service'
import { z } from 'zod'

const registerSchema = z.object({
  fcm_token: z.string().min(1),
  device_label: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const body = await request.json()
    const { fcm_token, device_label } = registerSchema.parse(body)

    await upsertPushToken(authResult.user.id, fcm_token, device_label ?? null)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Push] Token registered for user ${authResult.user.id}`)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register push token' },
      { status: 500 }
    )
  }
}

const unregisterSchema = z.object({
  fcm_token: z.string().min(1),
})

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const body = await request.json().catch(() => ({}))
    const { fcm_token } = unregisterSchema.parse(body)

    await deletePushToken(fcm_token)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unregister push token' },
      { status: 500 }
    )
  }
}
