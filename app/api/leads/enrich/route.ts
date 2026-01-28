import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { enrichLeadData, validateLeadData } from '@/backend/services/enrichment.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const enrichSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const data = enrichSchema.parse(body)

    const enrichment = await enrichLeadData(data)
    const validation = await validateLeadData(data)

    return NextResponse.json({
      enrichment,
      validation,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enrich lead data' },
      { status: 500 }
    )
  }
}
