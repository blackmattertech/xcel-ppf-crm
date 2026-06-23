import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { canManageAutomation } from '@/backend/services/whatsapp-automation-auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const permissions = user.role?.permissions?.map((p) => p.name) || []
    if (!canManageAutomation(user.role?.name, permissions)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const flowId = searchParams.get('flowId')
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    const supabase = createServiceClient()
    let query = supabase
      .from('whatsapp_automation_send_log')
      .select(
        `
        id, batch_id, enrollment_id, trigger_id, lead_id, phone, status, wamid, error, attempt_count, cycle_number, sent_at,
        trigger:whatsapp_automation_triggers ( day_offset, message_type ),
        lead:leads ( name, lead_id )
      `
      )
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (flowId) {
      const { data: batches } = await supabase
        .from('whatsapp_automation_trigger_batches')
        .select('id')
        .eq('flow_id', flowId)
      const batchIds = (batches || []).map((b) => (b as { id: string }).id)
      if (batchIds.length === 0) return NextResponse.json({ logs: [] })
      query = query.in('batch_id', batchIds)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return NextResponse.json({ logs: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch logs' },
      { status: 500 }
    )
  }
}
