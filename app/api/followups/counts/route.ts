import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getFollowUpCountsByLeadIds } from '@/backend/services/followup.service'
import { z } from 'zod'

const bodySchema = z.object({
  leadIds: z.array(z.string().uuid()).max(500),
})

/**
 * POST /api/followups/counts – return follow-up count per lead in one request.
 * Body: { leadIds: string[] }. Response: { counts: Record<string, number> }.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const body = await request.json()
    const { leadIds } = bodySchema.parse(body)
    const counts = await getFollowUpCountsByLeadIds(leadIds)
    return NextResponse.json({ counts })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch counts' },
      { status: 500 }
    )
  }
}
