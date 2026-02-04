/**
 * Sidebar menu items configuration
 * This is the source of truth for sidebar items and their corresponding permissions
 * When you add a new item here, permissions will be auto-generated
 */

export interface SidebarMenuItem {
  name: string
  href: string
  icon: string
  iconPath?: string // Path to SVG icon in public/assets/sidebar
  resource: string // The resource name for permissions (e.g., 'leads', 'products')
  roles?: string[] // If specified, only show for these roles
  requiresPermissions?: boolean // If true, will generate permissions for this item
}

export const SIDEBAR_MENU_ITEMS: SidebarMenuItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: '📊',
    iconPath: '/assets/sidebar/dashboard.svg',
    resource: 'dashboard',
    requiresPermissions: false, // Dashboard is accessible to all authenticated users
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: '🏢',
    iconPath: '/assets/sidebar/customers.svg',
    resource: 'customers',
    requiresPermissions: true,
  },
  {
    name: 'Leads',
    href: '/leads',
    icon: '👥',
    iconPath: '/assets/sidebar/leads.svg',
    resource: 'leads',
    requiresPermissions: true,
  },
  {
    name: 'Tasks & Followups',
    href: '/followups',
    icon: '📅',
    iconPath: '/assets/sidebar/tasks.svg',
    resource: 'followups',
    requiresPermissions: true,
  },
  {
    name: 'Sales Pipeline',
    href: '/orders',
    icon: '📈',
    iconPath: '/assets/sidebar/sales-pipeline.svg',
    resource: 'sales',
    requiresPermissions: false,
  },
  {
    name: 'Communication',
    href: '/communication',
    icon: '💬',
    iconPath: '/assets/sidebar/communication.svg',
    resource: 'communication',
    requiresPermissions: false,
  },
  {
    name: 'Marketing',
    href: '/marketing',
    icon: '📢',
    iconPath: '/assets/sidebar/marketing.svg',
    resource: 'marketing',
    requiresPermissions: false,
  },
  {
    name: 'Teams',
    href: '/teams',
    icon: '👥',
    iconPath: '/assets/sidebar/teams.svg',
    resource: 'teams',
    requiresPermissions: false,
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: '📊',
    iconPath: '/assets/sidebar/reports.svg',
    resource: 'reports',
    requiresPermissions: false,
  },
  {
    name: 'Products',
    href: '/products',
    icon: '🛍️',
    iconPath: '/assets/sidebar/products.svg',
    resource: 'products',
    roles: ['super_admin', 'admin', 'marketing'],
    requiresPermissions: true,
  },
  {
    name: 'Integrations',
    href: '/integrations',
    icon: '🔌',
    iconPath: '/assets/sidebar/integrations.svg',
    resource: 'integrations',
    requiresPermissions: false,
  },
  {
    name: 'Roles & Permissions',
    href: '/admin/roles',
    icon: '🔐',
    iconPath: '/assets/sidebar/roles.svg',
    resource: 'roles',
    roles: ['super_admin', 'admin'],
    requiresPermissions: true,
  },
  // User Management - Commented out as functionality moved to Teams page
  // {
  //   name: 'User Management',
  //   href: '/admin/users',
  //   icon: '👤',
  //   iconPath: '/assets/sidebar/users.svg',
  //   resource: 'users',
  //   roles: ['super_admin', 'admin'],
  //   requiresPermissions: true,
  // },
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
