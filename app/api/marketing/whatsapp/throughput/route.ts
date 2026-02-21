import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getPhoneNumberThroughput } from '@/backend/services/whatsapp.service'

/**
 * GET - Current throughput (messages per second) for the configured business phone number.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/throughput
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireAuth(_request)
  if ('error' in authResult) return authResult.error

  const result = await getPhoneNumberThroughput()
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes('not configured') ? 503 : 502 }
    )
  }
  return NextResponse.json({ throughput: result.throughput })
}
