import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { findDuplicateCandidates, getAllDuplicatePairs } from '@/backend/services/duplicate-detection.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const findDuplicatesSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  excludeLeadId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { name, phone, email, excludeLeadId } = findDuplicatesSchema.parse(body)

    if (!name && !phone && !email) {
      return NextResponse.json(
        { error: 'At least one of name, phone, or email is required' },
        { status: 400 }
      )
    }

    const candidates = await findDuplicateCandidates(
      { name, phone, email } as any,
      excludeLeadId
    )

    return NextResponse.json({ candidates })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to find duplicates' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const threshold = searchParams.get('threshold') ? parseFloat(searchParams.get('threshold')!) : 0.7

    const pairs = await getAllDuplicatePairs(threshold)

    return NextResponse.json({ pairs, count: pairs.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to find duplicate pairs' },
      { status: 500 }
    )
  }
}
