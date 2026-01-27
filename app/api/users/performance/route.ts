import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { createServiceClient } from '@/lib/supabase/service'

// Aggregated performance stats per user, to replace N+1 Supabase queries
// on the Teams page. This preserves existing behaviour (assignedLeads,
// convertedLeads, rating, status) but computes everything in one go.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.USERS_READ)

    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()

    // Aggregate leads assigned per user and count conversions in one query.
    const { data, error } = await supabase
      .from('leads')
      .select('assigned_to, status')

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch user performance: ${error.message}` },
        { status: 500 }
      )
    }

    type Row = { assigned_to: string | null; status: string | null }
    const rows = (data || []) as Row[]

    const statsMap = new Map<
      string,
      {
        assignedLeads: number
        convertedLeads: number
      }
    >()

    for (const row of rows) {
      if (!row.assigned_to) continue
      const key = row.assigned_to
      const existing = statsMap.get(key) || { assignedLeads: 0, convertedLeads: 0 }
      existing.assignedLeads += 1

      if (row.status && ['converted', 'deal_won', 'fully_paid'].includes(row.status)) {
        existing.convertedLeads += 1
      }

      statsMap.set(key, existing)
    }

    const result = Array.from(statsMap.entries()).map(([userId, { assignedLeads, convertedLeads }]) => {
      const conversionRate = assignedLeads > 0 ? convertedLeads / assignedLeads : 0
      const ratingRaw = assignedLeads > 0 && convertedLeads > 0 ? Math.min(5, Math.max(0, conversionRate * 5)) : 0

      return {
        userId,
        assignedLeads,
        convertedLeads,
        rating: Math.round(ratingRaw * 10) / 10,
        status: 'active' as const,
      }
    })

    return NextResponse.json({ performance: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch user performance' },
      { status: 500 }
    )
  }
}

