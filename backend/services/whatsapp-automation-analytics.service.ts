import { createServiceClient } from '@/lib/supabase/service'

export interface AutomationAnalyticsParams {
  flowId: string
  startDate?: string
  endDate?: string
}

export interface AutomationAnalyticsResult {
  flow: {
    id: string
    name: string
    cycle_days: number
    is_active: boolean
    restart_on_complete: boolean
  }
  period: { startDate: string; endDate: string }
  enrollments: {
    active: number
    completed: number
    cancelled: number
    total: number
    direct: number
    bucket: number
  }
  sends: {
    sent: number
    failed: number
    retrying: number
    total: number
    successRate: number
  }
  byTriggerDay: Array<{
    trigger_id: string
    day_offset: number
    message_type: string
    sent: number
    failed: number
    retrying: number
    total: number
  }>
  batches: {
    pending: number
    processing: number
    completed: number
    failed: number
    total: number
  }
  sendsOverTime: Array<{ date: string; sent: number; failed: number; total: number }>
  enrollmentsOverTime: Array<{ date: string; count: number }>
  recentFailures: Array<{
    id: string
    lead_id: string | null
    lead_name: string | null
    phone: string
    day_offset: number | null
    message_type: string | null
    error: string | null
    sent_at: string
  }>
  bucketLinks: { active: number; total: number }
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function inPeriod(iso: string, start: string, end: string): boolean {
  const d = iso.slice(0, 10)
  return d >= start && d <= end
}

export async function getAutomationAnalytics(
  params: AutomationAnalyticsParams
): Promise<AutomationAnalyticsResult | null> {
  const supabase = createServiceClient()
  const period = defaultPeriod()
  const startDate = params.startDate?.slice(0, 10) || period.start
  const endDate = params.endDate?.slice(0, 10) || period.end
  const startIso = `${startDate}T00:00:00.000Z`
  const endIso = `${endDate}T23:59:59.999Z`

  const { data: flow, error: flowErr } = await supabase
    .from('whatsapp_automation_flows')
    .select('id, name, cycle_days, is_active, restart_on_complete')
    .eq('id', params.flowId)
    .maybeSingle()

  if (flowErr) throw new Error(flowErr.message)
  if (!flow) return null

  const flowRow = flow as AutomationAnalyticsResult['flow']

  const { data: enrollments } = await supabase
    .from('whatsapp_automation_lead_enrollments')
    .select('id, status, source, created_at')
    .eq('flow_id', params.flowId)

  const enr = enrollments || []
  const enrollmentsInPeriod = enr.filter((e) =>
    inPeriod((e as { created_at: string }).created_at, startDate, endDate)
  )

  const enrollmentStats = {
    active: enr.filter((e) => (e as { status: string }).status === 'active').length,
    completed: enr.filter((e) => (e as { status: string }).status === 'completed').length,
    cancelled: enr.filter((e) => (e as { status: string }).status === 'cancelled').length,
    total: enr.length,
    direct: enr.filter((e) => (e as { source: string }).source === 'direct').length,
    bucket: enr.filter((e) => (e as { source: string }).source === 'bucket').length,
  }

  const enrollmentsByDate = new Map<string, number>()
  for (const e of enrollmentsInPeriod) {
    const d = (e as { created_at: string }).created_at.slice(0, 10)
    enrollmentsByDate.set(d, (enrollmentsByDate.get(d) || 0) + 1)
  }

  const { data: triggers } = await supabase
    .from('whatsapp_automation_triggers')
    .select('id, day_offset, message_type')
    .eq('flow_id', params.flowId)

  const triggerMap = new Map(
    (triggers || []).map((t) => [
      (t as { id: string }).id,
      t as { id: string; day_offset: number; message_type: string },
    ])
  )

  const { data: batches } = await supabase
    .from('whatsapp_automation_trigger_batches')
    .select('id, status, created_at')
    .eq('flow_id', params.flowId)

  const batchList = batches || []
  const batchStats = {
    pending: batchList.filter((b) => (b as { status: string }).status === 'pending').length,
    processing: batchList.filter((b) => (b as { status: string }).status === 'processing').length,
    completed: batchList.filter((b) => (b as { status: string }).status === 'completed').length,
    failed: batchList.filter((b) => (b as { status: string }).status === 'failed').length,
    total: batchList.length,
  }

  const batchIds = batchList.map((b) => (b as { id: string }).id)

  let sendLogs: Array<{
    id: string
    trigger_id: string | null
    lead_id: string | null
    phone: string
    status: string
    error: string | null
    sent_at: string
    lead?: { name: string; lead_id: string } | null
  }> = []

  if (batchIds.length > 0) {
    const { data: logs, error: logErr } = await supabase
      .from('whatsapp_automation_send_log')
      .select(
        `
        id, trigger_id, lead_id, phone, status, error, sent_at,
        lead:leads ( name, lead_id )
      `
      )
      .in('batch_id', batchIds)
      .gte('sent_at', startIso)
      .lte('sent_at', endIso)
      .order('sent_at', { ascending: false })

    if (logErr) throw new Error(logErr.message)
    sendLogs = (logs || []) as typeof sendLogs
  }

  let sent = 0
  let failed = 0
  let retrying = 0
  const byTrigger = new Map<
    string,
    { sent: number; failed: number; retrying: number }
  >()
  const sendsByDate = new Map<string, { sent: number; failed: number }>()

  for (const log of sendLogs) {
    const st = log.status
    if (st === 'sent') sent++
    else if (st === 'failed') failed++
    else if (st === 'retrying') retrying++

    if (log.trigger_id) {
      const cur = byTrigger.get(log.trigger_id) || { sent: 0, failed: 0, retrying: 0 }
      if (st === 'sent') cur.sent++
      else if (st === 'failed') cur.failed++
      else if (st === 'retrying') cur.retrying++
      byTrigger.set(log.trigger_id, cur)
    }

    const d = log.sent_at.slice(0, 10)
    const day = sendsByDate.get(d) || { sent: 0, failed: 0 }
    if (st === 'sent') day.sent++
    else if (st === 'failed') day.failed++
    sendsByDate.set(d, day)
  }

  const totalSends = sent + failed + retrying
  const successRate = totalSends > 0 ? Math.round((sent / totalSends) * 1000) / 10 : 0

  const byTriggerDay = (triggers || []).map((t) => {
    const tr = t as { id: string; day_offset: number; message_type: string }
    const counts = byTrigger.get(tr.id) || { sent: 0, failed: 0, retrying: 0 }
    const total = counts.sent + counts.failed + counts.retrying
    return {
      trigger_id: tr.id,
      day_offset: tr.day_offset,
      message_type: tr.message_type,
      ...counts,
      total,
    }
  }).sort((a, b) => a.day_offset - b.day_offset)

  const { data: links } = await supabase
    .from('whatsapp_automation_bucket_links')
    .select('id, is_active')
    .eq('flow_id', params.flowId)

  const linkList = links || []

  const recentFailures = sendLogs
    .filter((l) => l.status === 'failed')
    .slice(0, 25)
    .map((l) => {
      const tr = l.trigger_id ? triggerMap.get(l.trigger_id) : null
      return {
        id: l.id,
        lead_id: l.lead_id,
        lead_name: l.lead?.name ?? null,
        phone: l.phone,
        day_offset: tr?.day_offset ?? null,
        message_type: tr?.message_type ?? null,
        error: l.error,
        sent_at: l.sent_at,
      }
    })

  const sendsOverTime = [...sendsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, sent: v.sent, failed: v.failed, total: v.sent + v.failed }))

  const enrollmentsOverTime = [...enrollmentsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return {
    flow: flowRow,
    period: { startDate, endDate },
    enrollments: enrollmentStats,
    sends: { sent, failed, retrying, total: totalSends, successRate },
    byTriggerDay,
    batches: batchStats,
    sendsOverTime,
    enrollmentsOverTime,
    recentFailures,
    bucketLinks: {
      active: linkList.filter((l) => (l as { is_active: boolean }).is_active).length,
      total: linkList.length,
    },
  }
}
