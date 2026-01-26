import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { sendWhatsAppToLead } from '@/backend/services/integrations/whatsapp.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const sendWhatsAppSchema = z.object({
  leadId: z.string().uuid(),
  to: z.string().min(1),
  message: z.string().min(1),
  template: z.string().optional(),
  templateParams: z.record(z.string()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { leadId, to, message, template, templateParams } = sendWhatsAppSchema.parse(body)

    const result = await sendWhatsAppToLead(
      leadId,
      {
        to,
        message,
        template,
        templateParams,
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
      { error: error instanceof Error ? error.message : 'Failed to send WhatsApp' },
      { status: 500 }
    )
  }
}
