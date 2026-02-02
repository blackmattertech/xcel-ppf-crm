import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { sendSMSToLead } from '@/backend/services/integrations/sms.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const sendSMSSchema = z.object({
  leadId: z.string().uuid(),
  to: z.string().min(1),
  message: z.string().min(1).max(1600), // SMS character limit
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { leadId, to, message } = sendSMSSchema.parse(body)

    const result = await sendSMSToLead(
      leadId,
      {
        to,
        message,
      },
      authResult.user.id
    )

    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send SMS' },
      { status: 500 }
    )
  }
}
