import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { PERMISSIONS } from '@/shared/constants/permissions'

export function canManageAutomation(userRole: string | undefined, permissions: string[]): boolean {
  return (
    userRole === SYSTEM_ROLES.SUPER_ADMIN ||
    userRole === SYSTEM_ROLES.ADMIN ||
    permissions.includes(PERMISSIONS.WHATSAPP_AUTOMATION_MANAGE) ||
    permissions.includes(PERMISSIONS.WHATSAPP_AUTOMATION_CREATE)
  )
}

export function canReadAutomation(userRole: string | undefined, permissions: string[]): boolean {
  return (
    canManageAutomation(userRole, permissions) ||
    permissions.includes(PERMISSIONS.WHATSAPP_AUTOMATION_READ) ||
    permissions.includes(PERMISSIONS.WHATSAPP_AUTOMATION_ENROLL)
  )
}

export function canEnrollAutomation(userRole: string | undefined, permissions: string[]): boolean {
  return (
    canManageAutomation(userRole, permissions) ||
    permissions.includes(PERMISSIONS.WHATSAPP_AUTOMATION_ENROLL) ||
    permissions.includes('leads.update')
  )
}
