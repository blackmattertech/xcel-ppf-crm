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
