import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getNurtureCampaigns, createNurtureCampaign } from '@/backend/services/nurturing.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  campaignType: z.enum(['drip', 'trigger', 're_engagement']),
  triggerCondition: z
    .object({
      leadStatus: z.array(z.string()).optional(),
      daysSinceLastActivity: z.number().optional(),
      interestLevel: z.array(z.string()).optional(),
    })
    .optional(),
  steps: z.array(
    z.object({
      stepOrder: z.number().int().min(1),
      stepType: z.enum(['email', 'sms', 'whatsapp', 'delay', 'action']),
      delayHours: z.number().int().min(0).optional(),
      content: z
        .object({
          subject: z.string().optional(),
          body: z.string().optional(),
          template: z.string().optional(),
        })
        .optional(),
      actionType: z.string().optional(),
      actionData: z.record(z.any()).optional(),
    })
  ),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const isActive = searchParams.get('isActive')

    const campaigns = await getNurtureCampaigns({
      isActive: isActive !== null ? isActive === 'true' : undefined,
    })

    return NextResponse.json({ campaigns })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaigns' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const campaignData = createCampaignSchema.parse(body)

    const campaign = await createNurtureCampaign(campaignData, authResult.user.id)

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create campaign' },
      { status: 500 }
    )
  }
}
