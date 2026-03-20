import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getConversation } from '@/backend/services/whatsapp-chat.service'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const leadId = request.nextUrl.searchParams.get('leadId')
  const phone = request.nextUrl.searchParams.get('phone')
  if (!leadId && !phone) {
    return NextResponse.json(
      { error: 'Provide leadId or phone' },
      { status: 400 }
    )
  }

  const messages = await getConversation(leadId || null, phone || '')
  return NextResponse.json({ messages })
}
