import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { createExternalServiceClient, getExternalCustomersTable } from '@/lib/supabase/service-ext'
import { PERMISSIONS } from '@/shared/constants/permissions'

/**
 * Lightweight count of warranty / external customer rows (same source as Customers → warranty claims).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.CUSTOMERS_READ)
    if ('error' in authResult) return authResult.error

    const extClient = createExternalServiceClient()
    const extTable = getExternalCustomersTable()
    if (!extClient) {
      return NextResponse.json({ count: 0, externalConfigured: false })
    }

    const { count, error } = await extClient.from(extTable).select('*', { count: 'exact', head: true })

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01' || code === 'PGRST116') {
        return NextResponse.json({ count: 0, externalConfigured: false })
      }
      console.error('[warranty-summary]', error.message)
      return NextResponse.json({ count: 0, externalConfigured: true, error: 'count_failed' })
    }

    return NextResponse.json({
      count: count ?? 0,
      externalConfigured: true,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load warranty summary' },
      { status: 500 }
    )
  }
}
