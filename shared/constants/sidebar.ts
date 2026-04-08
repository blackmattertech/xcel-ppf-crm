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
  /** Child items for dropdown (e.g. Marketing → Dashboard, WhatsApp) */
  children?: SidebarMenuItem[]
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
    requiresPermissions: true,
  },
  {
    name: 'Communication',
    href: '/communication',
    icon: '💬',
    iconPath: '/assets/sidebar/communication.svg',
    resource: 'communication',
    requiresPermissions: true,
  },
  {
    name: 'Marketing',
    href: '/marketing/dashboard',
    icon: '📢',
    iconPath: '/assets/sidebar/marketing.svg',
    resource: 'marketing',
    requiresPermissions: true,
    children: [
      { name: 'Dashboard', href: '/marketing/dashboard', icon: '📊', resource: 'marketing_dashboard', requiresPermissions: true },
      { name: 'Landing page', href: '/marketing/landing', icon: '🌐', resource: 'marketing_landing', requiresPermissions: true },
      { name: 'WhatsApp', href: '/marketing/whatsapp', icon: '💬', resource: 'marketing_whatsapp', requiresPermissions: true },
    ],
  },
  {
    name: 'Teams',
    href: '/teams',
    icon: '👥',
    iconPath: '/assets/sidebar/teams.svg',
    resource: 'teams',
    requiresPermissions: true,
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: '📊',
    iconPath: '/assets/sidebar/reports.svg',
    resource: 'reports',
    requiresPermissions: true,
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
    requiresPermissions: true,
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

function collectResources(item: SidebarMenuItem): string[] {
  const list: string[] = []
  if (item.requiresPermissions) list.push(item.resource)
  for (const child of item.children ?? []) {
    if (child.requiresPermissions) list.push(child.resource)
  }
  return list
}

/**
 * Get all resources that require permissions from sidebar items (including children)
 */
export function getResourcesRequiringPermissions(): string[] {
  const resources: string[] = []
  for (const item of SIDEBAR_MENU_ITEMS) {
    resources.push(...collectResources(item))
  }
  return [...new Set(resources)]
}

/** All resources from sidebar (including children) for permission sync */
export function getAllSidebarResources(): string[] {
  const resources: string[] = []
  for (const item of SIDEBAR_MENU_ITEMS) {
    resources.push(item.resource)
    for (const child of item.children ?? []) {
      resources.push(child.resource)
    }
  }
  return [...new Set(resources)]
}
