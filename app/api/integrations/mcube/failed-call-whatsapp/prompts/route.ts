import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getPendingFailedCallWhatsAppPromptsForUser } from '@/backend/services/mcube-failed-call-whatsapp.service'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const prompts = await getPendingFailedCallWhatsAppPromptsForUser(authResult.user.id)
    return NextResponse.json({ prompts })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load prompts' },
      { status: 500 }
    )
  }
}
