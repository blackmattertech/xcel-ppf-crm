import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getLeadScore, recalculateLeadScore } from '@/backend/services/scoring.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const score = await getLeadScore(id)

    if (!score) {
      // Calculate if doesn't exist
      const newScore = await recalculateLeadScore(id)
      return NextResponse.json({ score: newScore })
    }

    return NextResponse.json({ score })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch lead score' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const score = await recalculateLeadScore(id)

    return NextResponse.json({ score })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recalculate lead score' },
      { status: 500 }
    )
  }
}
