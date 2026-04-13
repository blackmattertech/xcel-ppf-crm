/** Recharts Tooltip passes `value` as string | number | array — normalize for display. */
export function rechartsTooltipNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
