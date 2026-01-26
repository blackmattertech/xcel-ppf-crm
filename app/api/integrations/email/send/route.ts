import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { sendEmailToLead } from '@/backend/services/integrations/email.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const sendEmailSchema = z.object({
  leadId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  html: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { leadId, to, subject, body, html } = sendEmailSchema.parse(body)

    const result = await sendEmailToLead(
      leadId,
      {
        to,
        subject,
        body,
        html,
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
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}
