import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getRecycleRules, upsertRecycleRule } from '@/backend/services/recycle.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const createRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  triggerStatus: z.array(z.string()),
  recycleAfterDays: z.number().int().min(1),
  maxRecycleCount: z.number().int().min(1),
  newStatus: z.string(),
  autoEnrollCampaignId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const isActive = searchParams.get('isActive')

    const rules = await getRecycleRules({
      isActive: isActive !== null ? isActive === 'true' : undefined,
    })

    return NextResponse.json({ rules })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch recycle rules' },
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
    const ruleData = createRuleSchema.parse(body)

    const rule = await upsertRecycleRule(ruleData)

    return NextResponse.json({ rule }, { status: ruleData.id ? 200 : 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create/update recycle rule' },
      { status: 500 }
    )
  }
}
