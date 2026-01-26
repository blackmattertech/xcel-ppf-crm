/**
 * Sidebar menu items configuration
 * This is the source of truth for sidebar items and their corresponding permissions
 * When you add a new item here, permissions will be auto-generated
 */

export interface SidebarMenuItem {
  name: string
  href: string
  icon: string
  resource: string // The resource name for permissions (e.g., 'leads', 'products')
  roles?: string[] // If specified, only show for these roles
  requiresPermissions?: boolean // If true, will generate permissions for this item
}

export const SIDEBAR_MENU_ITEMS: SidebarMenuItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: '📊',
    resource: 'dashboard',
    requiresPermissions: false, // Dashboard is accessible to all authenticated users
  },
  {
    name: 'Leads',
    href: '/leads',
    icon: '👥',
    resource: 'leads',
    requiresPermissions: true,
  },
  {
    name: 'Follow-ups',
    href: '/followups',
    icon: '📅',
    resource: 'followups',
    requiresPermissions: true,
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: '🏢',
    resource: 'customers',
    requiresPermissions: true,
  },
  {
    name: 'Orders',
    href: '/orders',
    icon: '📦',
    resource: 'orders',
    requiresPermissions: true,
  },
  {
    name: 'Quotations',
    href: '/quotations',
    icon: '📄',
    resource: 'quotations',
    requiresPermissions: true,
  },
  {
    name: 'Products',
    href: '/products',
    icon: '🛍️',
    resource: 'products',
    roles: ['super_admin', 'admin', 'marketing'],
    requiresPermissions: true,
  },
  {
    name: 'Roles & Permissions',
    href: '/admin/roles',
    icon: '🔐',
    resource: 'roles',
    roles: ['super_admin', 'admin'],
    requiresPermissions: true,
  },
  {
    name: 'User Management',
    href: '/admin/users',
    icon: '👤',
    resource: 'users',
    roles: ['super_admin', 'admin'],
    requiresPermissions: true,
  },
]

/**
 * Generate permissions for a resource
 * Returns standard CRUD permissions + manage permission
 */
export function generatePermissionsForResource(resource: string) {
  return [
    { name: `${resource}.create`, resource, action: 'create', description: `Create new ${resource}` },
    { name: `${resource}.read`, resource, action: 'read', description: `View ${resource}` },
    { name: `${resource}.update`, resource, action: 'update', description: `Update ${resource} information` },
    { name: `${resource}.delete`, resource, action: 'delete', description: `Delete ${resource}` },
    { name: `${resource}.manage`, resource, action: 'manage', description: `Full ${resource} management access` },
  ]
}

/**
 * Get all resources that require permissions from sidebar items
 */
export function getResourcesRequiringPermissions(): string[] {
  return SIDEBAR_MENU_ITEMS
    .filter(item => item.requiresPermissions)
    .map(item => item.resource)
    .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates
}
