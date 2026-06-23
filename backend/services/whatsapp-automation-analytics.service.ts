import { createServiceClient } from '@/lib/supabase/service'
import {
  istDateToUtcStart,
  todayIstDateString,
  toIstDateString,
} from '@/shared/whatsapp-automation-ist'

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
  period: { startDate: string; endDate: string; timezone: 'Asia/Kolkata' }
  enrollments: {
    active: number
    completed: number
    cancelled: number
    total: number
    inPeriod: number
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

const SEND_LOG_PAGE = 1000
const BATCH_ID_IN_CHUNK = 150

function defaultPeriod(): { start: string; end: string } {
  const end = todayIstDateString()
  const startMs = istDateToUtcStart(end).getTime() - 30 * 24 * 60 * 60 * 1000
  return {
    start: toIstDateString(new Date(startMs)),
    end,
  }
}

function istEndOfDayUtc(isoDate: string): Date {
  return new Date(istDateToUtcStart(isoDate).getTime() + 24 * 60 * 60 * 1000 - 1)
}

function inIstPeriod(iso: string, start: string, end: string): boolean {
  const d = toIstDateString(new Date(iso))
  return d >= start && d <= end
}

function extractBatchDeliveryTotals(resultJson: unknown): { sent: number; failed: number } | null {
  if (!resultJson || typeof resultJson !== 'object') return null
  const root = resultJson as Record<string, unknown>

  if (typeof root.sent === 'number') {
    const failed = Array.isArray(root.givenUp) ? root.givenUp.length : 0
    return { sent: root.sent, failed }
  }

  const progress = root.broadcastProgress
  if (!progress || typeof progress !== 'object') return null
  const pr = progress as Record<string, unknown>
  const sent = typeof pr.sentTotal === 'number' ? pr.sentTotal : 0
  const failed = Array.isArray(pr.givenUp) ? pr.givenUp.length : 0
  if (sent === 0 && failed === 0) return null
  return { sent, failed }
}

type SendLogRow = {
  id: string
  batch_id: string | null
  trigger_id: string | null
  lead_id: string | null
  phone: string
  status: string
  error: string | null
  sent_at: string
  lead?: { name: string; lead_id: string } | null
}

type BatchRow = {
  id: string
  status: string
  trigger_id: string
  run_date: string
  result_json: unknown
}

async function fetchAllEnrollments(
  supabase: ReturnType<typeof createServiceClient>,
  flowId: string
): Promise<Array<{ id: string; status: string; source: string; created_at: string }>> {
  const all: Array<{ id: string; status: string; source: string; created_at: string }> = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('whatsapp_automation_lead_enrollments')
      .select('id, status, source, created_at')
      .eq('flow_id', flowId)
      .order('created_at', { ascending: true })
      .range(offset, offset + SEND_LOG_PAGE - 1)

    if (error) throw new Error(error.message)
    const page = (data || []) as Array<{ id: string; status: string; source: string; created_at: string }>
    all.push(...page)
    if (page.length < SEND_LOG_PAGE) break
    offset += SEND_LOG_PAGE
  }

  return all
}

async function fetchSendLogsForBatches(
  supabase: ReturnType<typeof createServiceClient>,
  batchIds: string[],
  startIso: string,
  endIso: string
): Promise<SendLogRow[]> {
  if (batchIds.length === 0) return []

  const all: SendLogRow[] = []

  for (let i = 0; i < batchIds.length; i += BATCH_ID_IN_CHUNK) {
    const idChunk = batchIds.slice(i, i + BATCH_ID_IN_CHUNK)
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from('whatsapp_automation_send_log')
        .select(
          `
          id, batch_id, trigger_id, lead_id, phone, status, error, sent_at,
          lead:leads ( name, lead_id )
        `
        )
        .in('batch_id', idChunk)
        .gte('sent_at', startIso)
        .lte('sent_at', endIso)
        .order('sent_at', { ascending: false })
        .range(offset, offset + SEND_LOG_PAGE - 1)

      if (error) throw new Error(error.message)
      const page = (data || []) as SendLogRow[]
      all.push(...page)
      if (page.length < SEND_LOG_PAGE) break
      offset += SEND_LOG_PAGE
    }
  }

  return all
}

export async function getAutomationAnalytics(
  params: AutomationAnalyticsParams
): Promise<AutomationAnalyticsResult | null> {
  const supabase = createServiceClient()
  const period = defaultPeriod()
  const startDate = params.startDate?.slice(0, 10) || period.start
  const endDate = params.endDate?.slice(0, 10) || period.end
  const startIso = istDateToUtcStart(startDate).toISOString()
  const endIso = istEndOfDayUtc(endDate).toISOString()

  const { data: flow, error: flowErr } = await supabase
    .from('whatsapp_automation_flows')
    .select('id, name, cycle_days, is_active, restart_on_complete')
    .eq('id', params.flowId)
    .maybeSingle()

  if (flowErr) throw new Error(flowErr.message)
  if (!flow) return null

  const flowRow = flow as AutomationAnalyticsResult['flow']

  const enr = await fetchAllEnrollments(supabase, params.flowId)
  const enrollmentsInPeriod = enr.filter((e) => inIstPeriod(e.created_at, startDate, endDate))

  const enrollmentStats = {
    active: enr.filter((e) => e.status === 'active').length,
    completed: enr.filter((e) => e.status === 'completed').length,
    cancelled: enr.filter((e) => e.status === 'cancelled').length,
    total: enr.length,
    inPeriod: enrollmentsInPeriod.length,
    direct: enr.filter((e) => e.source === 'direct').length,
    bucket: enr.filter((e) => e.source === 'bucket').length,
  }

  const enrollmentsByDate = new Map<string, number>()
  for (const e of enrollmentsInPeriod) {
    const d = toIstDateString(new Date(e.created_at))
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

  const { data: batches, error: batchErr } = await supabase
    .from('whatsapp_automation_trigger_batches')
    .select('id, status, trigger_id, run_date, result_json')
    .eq('flow_id', params.flowId)
    .gte('run_date', startDate)
    .lte('run_date', endDate)

  if (batchErr) throw new Error(batchErr.message)

  const batchList = (batches || []) as BatchRow[]
  const batchStats = {
    pending: batchList.filter((b) => b.status === 'pending').length,
    processing: batchList.filter((b) => b.status === 'processing').length,
    completed: batchList.filter((b) => b.status === 'completed').length,
    failed: batchList.filter((b) => b.status === 'failed').length,
    total: batchList.length,
  }

  const batchIds = batchList.map((b) => b.id)
  const sendLogs = await fetchSendLogsForBatches(supabase, batchIds, startIso, endIso)

  const logsByBatch = new Map<string, number>()
  for (const log of sendLogs) {
    if (!log.batch_id) continue
    logsByBatch.set(log.batch_id, (logsByBatch.get(log.batch_id) || 0) + 1)
  }

  let sent = 0
  let failed = 0
  let retrying = 0
  const byTrigger = new Map<string, { sent: number; failed: number; retrying: number }>()
  const sendsByDate = new Map<string, { sent: number; failed: number }>()

  const addSendCounts = (
    triggerId: string | null,
    dateKey: string,
    counts: { sent: number; failed: number; retrying?: number }
  ) => {
    sent += counts.sent
    failed += counts.failed
    retrying += counts.retrying ?? 0

    if (triggerId) {
      const cur = byTrigger.get(triggerId) || { sent: 0, failed: 0, retrying: 0 }
      cur.sent += counts.sent
      cur.failed += counts.failed
      cur.retrying += counts.retrying ?? 0
      byTrigger.set(triggerId, cur)
    }

    const day = sendsByDate.get(dateKey) || { sent: 0, failed: 0 }
    day.sent += counts.sent
    day.failed += counts.failed
    sendsByDate.set(dateKey, day)
  }

  for (const log of sendLogs) {
    const st = log.status
    const dateKey = toIstDateString(new Date(log.sent_at))
    if (st === 'sent') addSendCounts(log.trigger_id, dateKey, { sent: 1, failed: 0 })
    else if (st === 'failed') addSendCounts(log.trigger_id, dateKey, { sent: 0, failed: 1 })
    else if (st === 'retrying')
      addSendCounts(log.trigger_id, dateKey, { sent: 0, failed: 0, retrying: 1 })
  }

  for (const batch of batchList) {
    if ((logsByBatch.get(batch.id) || 0) > 0) continue
    const totals = extractBatchDeliveryTotals(batch.result_json)
    if (!totals || (totals.sent === 0 && totals.failed === 0)) continue
    addSendCounts(batch.trigger_id, batch.run_date.slice(0, 10), {
      sent: totals.sent,
      failed: totals.failed,
    })
  }

  const totalSends = sent + failed + retrying
  const successRate = totalSends > 0 ? Math.round((sent / totalSends) * 1000) / 10 : 0

  const byTriggerDay = (triggers || [])
    .map((t) => {
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
    })
    .sort((a, b) => a.day_offset - b.day_offset)

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
    period: { startDate, endDate, timezone: 'Asia/Kolkata' },
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
