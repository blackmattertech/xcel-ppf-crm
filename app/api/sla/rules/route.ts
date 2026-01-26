import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getSLARules, upsertSLARule } from '@/backend/services/sla.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const createSLARuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  lead_source: z.enum(['meta', 'manual', 'form', 'whatsapp', 'ivr', 'all']),
  interest_level: z.enum(['hot', 'warm', 'cold', 'all']).nullable().optional(),
  lead_status: z.string().nullable().optional(),
  priority: z.number().int().min(0),
  first_contact_minutes: z.number().int().min(1),
  qualification_hours: z.number().int().min(1).nullable().optional(),
  followup_response_hours: z.number().int().min(1).nullable().optional(),
  quotation_delivery_hours: z.number().int().min(1).nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const isActive = searchParams.get('isActive')
    
    const filters = {
      isActive: isActive !== null ? isActive === 'true' : undefined,
    }

    const rules = await getSLARules(filters)
    return NextResponse.json({ rules })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch SLA rules' },
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
    const ruleData = createSLARuleSchema.parse(body)

    const rule = await upsertSLARule(ruleData)

    return NextResponse.json({ rule }, { status: ruleData.id ? 200 : 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create/update SLA rule' },
      { status: 500 }
    )
  }
}
