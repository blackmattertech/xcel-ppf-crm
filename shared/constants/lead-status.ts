export const LEAD_STATUS = {
  NEW: 'new',
  QUALIFIED: 'qualified',
  UNQUALIFIED: 'unqualified',
  QUOTATION_SHARED: 'quotation_shared',
  QUOTATION_VIEWED: 'quotation_viewed',
  QUOTATION_ACCEPTED: 'quotation_accepted',
  QUOTATION_EXPIRED: 'quotation_expired',
  INTERESTED: 'interested',
  NEGOTIATION: 'negotiation',
  LOST: 'lost',
  DISCARDED: 'discarded',
  CONVERTED: 'converted',
  DEAL_WON: 'deal_won',
  PAYMENT_PENDING: 'payment_pending',
  ADVANCE_RECEIVED: 'advance_received',
  FULLY_PAID: 'fully_paid',
} as const

export type LeadStatus = typeof LEAD_STATUS[keyof typeof LEAD_STATUS]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  [LEAD_STATUS.NEW]: 'New Lead',
  [LEAD_STATUS.QUALIFIED]: 'Qualified',
  [LEAD_STATUS.UNQUALIFIED]: 'Unqualified',
  [LEAD_STATUS.QUOTATION_SHARED]: 'Quotation Shared',
  [LEAD_STATUS.QUOTATION_VIEWED]: 'Quotation Viewed',
  [LEAD_STATUS.QUOTATION_ACCEPTED]: 'Quotation Accepted',
  [LEAD_STATUS.QUOTATION_EXPIRED]: 'Quotation Expired',
  [LEAD_STATUS.INTERESTED]: 'Interested',
  [LEAD_STATUS.NEGOTIATION]: 'Negotiation',
  [LEAD_STATUS.LOST]: 'Lost',
  [LEAD_STATUS.DISCARDED]: 'Discarded',
  [LEAD_STATUS.CONVERTED]: 'Converted',
  [LEAD_STATUS.DEAL_WON]: 'Deal Won',
  [LEAD_STATUS.PAYMENT_PENDING]: 'Payment Pending',
  [LEAD_STATUS.ADVANCE_RECEIVED]: 'Advance Received',
  [LEAD_STATUS.FULLY_PAID]: 'Fully Paid',
}

export const LEAD_STATUS_ICONS: Record<LeadStatus, string> = {
  [LEAD_STATUS.NEW]: '🆕',
  [LEAD_STATUS.QUALIFIED]: '✅',
  [LEAD_STATUS.UNQUALIFIED]: '❌',
  [LEAD_STATUS.QUOTATION_SHARED]: '📄',
  [LEAD_STATUS.QUOTATION_VIEWED]: '👁️',
  [LEAD_STATUS.QUOTATION_ACCEPTED]: '✅',
  [LEAD_STATUS.QUOTATION_EXPIRED]: '⏰',
  [LEAD_STATUS.INTERESTED]: '🟢',
  [LEAD_STATUS.NEGOTIATION]: '🟡',
  [LEAD_STATUS.LOST]: '🔴',
  [LEAD_STATUS.DISCARDED]: '🗑️',
  [LEAD_STATUS.CONVERTED]: '💼',
  [LEAD_STATUS.DEAL_WON]: '✔️',
  [LEAD_STATUS.PAYMENT_PENDING]: '💰',
  [LEAD_STATUS.ADVANCE_RECEIVED]: '💵',
  [LEAD_STATUS.FULLY_PAID]: '✔️',
}

export const INTEREST_LEVEL = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
} as const

export type InterestLevel = typeof INTEREST_LEVEL[keyof typeof INTEREST_LEVEL]

export const INTEREST_LEVEL_LABELS: Record<InterestLevel, string> = {
  [INTEREST_LEVEL.HOT]: '🔥 Hot - Fast Track',
  [INTEREST_LEVEL.WARM]: '🌡️ Warm - Nurture Flow',
  [INTEREST_LEVEL.COLD]: '❄️ Cold - Nurture Flow',
}

export const CALL_OUTCOME = {
  CONNECTED: 'connected',
  NOT_REACHABLE: 'not_reachable',
  WRONG_NUMBER: 'wrong_number',
  CALL_LATER: 'call_later',
} as const

export type CallOutcome = typeof CALL_OUTCOME[keyof typeof CALL_OUTCOME]

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  [CALL_OUTCOME.CONNECTED]: '✔ Connected',
  [CALL_OUTCOME.NOT_REACHABLE]: 'X Not Reachable',
  [CALL_OUTCOME.WRONG_NUMBER]: 'X Wrong Number',
  [CALL_OUTCOME.CALL_LATER]: '🕒 Call Later',
}

// Updated flow based on the lifecycle
export const LEAD_STATUS_FLOW: Record<LeadStatus, LeadStatus[]> = {
  [LEAD_STATUS.NEW]: [LEAD_STATUS.QUALIFIED, LEAD_STATUS.UNQUALIFIED],
  [LEAD_STATUS.QUALIFIED]: [LEAD_STATUS.QUOTATION_SHARED],
  [LEAD_STATUS.UNQUALIFIED]: [LEAD_STATUS.NEW], // Can be requalified
  [LEAD_STATUS.QUOTATION_SHARED]: [LEAD_STATUS.QUOTATION_VIEWED, LEAD_STATUS.QUOTATION_ACCEPTED, LEAD_STATUS.QUOTATION_EXPIRED],
  [LEAD_STATUS.QUOTATION_VIEWED]: [LEAD_STATUS.QUOTATION_ACCEPTED, LEAD_STATUS.QUOTATION_EXPIRED, LEAD_STATUS.INTERESTED],
  [LEAD_STATUS.QUOTATION_ACCEPTED]: [LEAD_STATUS.INTERESTED, LEAD_STATUS.NEGOTIATION],
  [LEAD_STATUS.QUOTATION_EXPIRED]: [LEAD_STATUS.QUOTATION_SHARED, LEAD_STATUS.INTERESTED], // Can resend quote
  [LEAD_STATUS.INTERESTED]: [LEAD_STATUS.NEGOTIATION, LEAD_STATUS.DEAL_WON, LEAD_STATUS.LOST],
  [LEAD_STATUS.NEGOTIATION]: [LEAD_STATUS.DEAL_WON, LEAD_STATUS.LOST, LEAD_STATUS.INTERESTED],
  [LEAD_STATUS.LOST]: [], // Terminal state
  [LEAD_STATUS.DISCARDED]: [], // Terminal state (wrong number, etc.)
  [LEAD_STATUS.CONVERTED]: [LEAD_STATUS.DEAL_WON], // Legacy support
  [LEAD_STATUS.DEAL_WON]: [LEAD_STATUS.PAYMENT_PENDING],
  [LEAD_STATUS.PAYMENT_PENDING]: [LEAD_STATUS.ADVANCE_RECEIVED, LEAD_STATUS.FULLY_PAID],
  [LEAD_STATUS.ADVANCE_RECEIVED]: [LEAD_STATUS.FULLY_PAID],
  [LEAD_STATUS.FULLY_PAID]: [], // Terminal state
}
