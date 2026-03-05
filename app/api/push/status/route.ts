import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getPushTokensByUserId } from '@/backend/services/push-token.service'

/**
 * GET /api/push/status – Check if push is configured and how many tokens the current user has.
 * Useful for debugging: confirm backend can send (FIREBASE_SERVICE_ACCOUNT) and token is stored.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const tokens = await getPushTokensByUserId(authResult.user.id)
    const backendCanSend = !!process.env.FIREBASE_SERVICE_ACCOUNT

    return NextResponse.json({
      configured: backendCanSend,
      tokensCount: tokens.length,
      message: backendCanSend
        ? tokens.length > 0
          ? 'Push is configured. This device can receive notifications.'
          : 'Push is configured but no FCM token registered yet. Allow notifications and refresh.'
        : 'Set FIREBASE_SERVICE_ACCOUNT in .env.local to send push from the server.',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get push status' },
      { status: 500 }
    )
  }
}
