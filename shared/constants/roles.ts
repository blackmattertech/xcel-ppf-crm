export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MARKETING: 'marketing',
  TELE_CALLER: 'tele_caller',
} as const

export type SystemRole = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES]

export const ROLE_LABELS: Record<SystemRole, string> = {
  [SYSTEM_ROLES.SUPER_ADMIN]: 'Super Admin',
  [SYSTEM_ROLES.ADMIN]: 'Admin',
  [SYSTEM_ROLES.MARKETING]: 'Marketing',
  [SYSTEM_ROLES.TELE_CALLER]: 'Tele-caller',
}

/**
 * Roles that are eligible for lead auto-assignment (round-robin).
 * Only tele_caller and sales-type roles receive new leads; admins/marketing do not.
 */
export const ASSIGNABLE_LEAD_ROLES = [
  'tele_caller',
  'sales',
  'sales_manager',
  'sales_executive',
] as const

/**
 * Roles that only see follow-ups assigned to them (not all follow-ups in the system).
 * Used for Tasks & Followups page and notifications.
 */
export const ROLES_WITH_ASSIGNED_ONLY_FOLLOWUPS = [
  'tele_caller',
  'telecaller',
  'sales',
  'sales_manager',
  'sales_executive',
] as const

export function isAssignedOnlyFollowUpsRole(roleName: string | null): boolean {
  if (!roleName) return false
  const lower = roleName.toLowerCase()
  return ROLES_WITH_ASSIGNED_ONLY_FOLLOWUPS.some((r) => r === lower)
}
