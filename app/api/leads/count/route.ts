import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATUS } from '@/shared/constants/lead-status'

// Lightweight endpoint to return a count of leads, used by pages that only
// need aggregate numbers (e.g. Follow-ups, Customers). This avoids fetching
// full lead lists when only a count is required.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)

    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()

    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      // Mirror the main leads query behaviour by excluding FULLY_PAID.
      .neq('status', LEAD_STATUS.FULLY_PAID)

    if (error) {
      return NextResponse.json(
        { error: `Failed to count leads: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to count leads' },
      { status: 500 }
    )
  }
}

