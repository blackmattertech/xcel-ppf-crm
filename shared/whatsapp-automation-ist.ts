/** IST calendar helpers for automation day offsets (Asia/Kolkata). */

export function toIstDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function istDateToUtcStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+05:30`)
}

/**
 * Length of one automation "day" window, in hours. Each drip step is spaced by
 * this many hours (e.g. 25 → Day 1 fires ~25h after enroll, Day 2 at ~50h).
 */
export const AUTOMATION_DAY_WINDOW_HOURS = 25

/**
 * Days since enrollment start, based on ELAPSED windows of AUTOMATION_DAY_WINDOW_HOURS
 * (not calendar dates). Day 0 = first window after enrollment, Day 1 = next window, etc.
 *
 * Using elapsed time (instead of IST calendar-date difference) keeps drip steps
 * evenly spaced. Calendar-date math caused evening enrollments to fire Day 1 just
 * hours later at the next midnight, bunching multiple days into one day.
 */
export function computeEnrollmentDay(startedAt: string, now: Date = new Date()): number {
  const startMs = new Date(startedAt).getTime()
  const nowMs = now.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0
  const windowMs = AUTOMATION_DAY_WINDOW_HOURS * 60 * 60 * 1000
  const diffDays = Math.floor((nowMs - startMs) / windowMs)
  return Math.max(0, diffDays)
}

export function todayIstDateString(now: Date = new Date()): string {
  return toIstDateString(now)
}
