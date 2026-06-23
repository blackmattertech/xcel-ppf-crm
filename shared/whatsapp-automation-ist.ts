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

/** Days since enrollment start (0 = enrollment day in IST). */
export function computeEnrollmentDay(startedAt: string, now: Date = new Date()): number {
  const startDate = toIstDateString(new Date(startedAt))
  const nowDate = toIstDateString(now)
  const startMs = istDateToUtcStart(startDate).getTime()
  const nowMs = istDateToUtcStart(nowDate).getTime()
  const diffDays = Math.floor((nowMs - startMs) / (24 * 60 * 60 * 1000))
  return Math.max(0, diffDays)
}

export function todayIstDateString(now: Date = new Date()): string {
  return toIstDateString(now)
}
