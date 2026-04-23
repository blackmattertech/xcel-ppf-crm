import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const MAX_RANGE_MS = 8 * 24 * 60 * 60 * 1000 // 8 days (inclusive buffer for TZ + week view later)

const querySchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  user_id: z.string().uuid().optional(),
})

function parseIsoBounds(startRaw: string, endRaw: string): { start: Date; end: Date } | { error: string } {
  const start = new Date(startRaw)
  const end = new Date(endRaw)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Invalid start or end datetime' }
  }
  if (end.getTime() < start.getTime()) {
    return { error: 'end must be on or after start' }
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    return { error: 'Date range cannot exceed 7 days' }
  }
  return { start, end }
}

function canViewAllCallers(roleName: string | undefined): boolean {
  const r = roleName?.toLowerCase() ?? ''
  return (
    r === SYSTEM_ROLES.SUPER_ADMIN ||
    r === SYSTEM_ROLES.ADMIN ||
    r === SYSTEM_ROLES.MARKETING
  )
}

function hasReportsPermission(user: {
  role: { name: string; permissions: { name: string }[] }
}): boolean {
  if (user.role.name === SYSTEM_ROLES.SUPER_ADMIN || user.role.name === SYSTEM_ROLES.ADMIN) {
    return true
  }
  return user.role.permissions.some(
    (p) => p.name === PERMISSIONS.REPORTS_READ || p.name === PERMISSIONS.REPORTS_MANAGE
  )
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }
    const { user } = authResult

    if (!hasReportsPermission(user)) {
      return NextResponse.json({ error: 'Forbidden: reports access required' }, { status: 403 })
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries())
    const parsed = querySchema.safeParse(params)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const bounds = parseIsoBounds(parsed.data.start, parsed.data.end)
    if ('error' in bounds) {
      return NextResponse.json({ error: bounds.error }, { status: 400 })
    }

    const { start, end } = bounds
    const startIso = start.toISOString()
    const endIso = end.toISOString()

    const viewAll = canViewAllCallers(user.role.name)
    let filterUserId: string | undefined
    if (viewAll) {
      filterUserId = parsed.data.user_id
    } else {
      filterUserId = user.id
    }

    const supabase = createServiceClient()

    let query = supabase
      .from('calls')
      .select(
        `
        id,
        lead_id,
        called_by,
        outcome,
        disposition,
        notes,
        call_duration,
        created_at,
        recording_url,
        started_at,
        ended_at,
        answered_duration_seconds,
        dial_status,
        direction,
        integration,
        mcube_agent_name,
        called_by_user:users!calls_called_by_fkey (
          id,
          name
        ),
        lead:leads (
          id,
          name,
          phone
        )
      `
      )
      .eq('integration', 'mcube')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(2500)

    if (filterUserId) {
      query = query.eq('called_by', filterUserId)
    }

    const { data: calls, error } = await query

    if (error) {
      throw new Error(`Failed to fetch calls: ${error.message}`)
    }

    type CallAggRow = {
      lead_id: string | null
      called_by: string
      outcome: string
      recording_url: string | null
      answered_duration_seconds: number | null
      call_duration: number | null
      called_by_user: { name?: string } | null
    }
    const rows = (calls ?? []) as CallAggRow[]
    const withRecording = rows.filter((c) => c.recording_url && String(c.recording_url).trim() !== '').length

    function isConnectedCall(c: CallAggRow): boolean {
      if (c.outcome !== 'connected') return false
      const dur = c.answered_duration_seconds ?? c.call_duration ?? 0
      return dur >= 5
    }

    // Count unique leads, not call rows
    const allLeadIds = new Set(rows.map((c) => c.lead_id).filter(Boolean))
    const connectedLeadIds = new Set(rows.filter(isConnectedCall).map((c) => c.lead_id).filter(Boolean))
    const notReachableLeadIds = new Set(rows.filter((c) => c.outcome === 'not_reachable').map((c) => c.lead_id).filter(Boolean))

    const totalLeads = allLeadIds.size
    const connected = connectedLeadIds.size
    const notReachable = notReachableLeadIds.size

    // Per-user: unique leads contacted, connected, not reachable
    const byUserLeads = new Map<string, { name: string; all: Set<string>; connected: Set<string>; notReachable: Set<string> }>()
    for (const c of rows) {
      const uid = c.called_by
      const name = c.called_by_user?.name ?? 'Unknown'
      const lid = c.lead_id
      if (!lid) continue
      if (!byUserLeads.has(uid)) {
        byUserLeads.set(uid, { name, all: new Set(), connected: new Set(), notReachable: new Set() })
      }
      const sets = byUserLeads.get(uid)!
      sets.name = name
      sets.all.add(lid)
      if (isConnectedCall(c)) sets.connected.add(lid)
      if (c.outcome === 'not_reachable') sets.notReachable.add(lid)
    }
    const byUser = Array.from(byUserLeads.entries())
      .map(([uid, sets]) => ({
        userId: uid,
        name: sets.name,
        count: sets.all.size,
        connected: sets.connected.size,
        notReachable: sets.notReachable.size,
      }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      calls: rows,
      summary: {
        totalLeads,
        connected,
        notReachable,
        withRecording,
        byUser,
      },
      range: { start: startIso, end: endIso },
      filter: { user_id: filterUserId ?? null, viewAll },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load report' },
      { status: 500 }
    )
  }
}
