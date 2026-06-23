export const PERMISSIONS = {
  // Leads
  LEADS_CREATE: 'leads.create',
  LEADS_READ: 'leads.read',
  LEADS_UPDATE: 'leads.update',
  LEADS_DELETE: 'leads.delete',
  LEADS_MANAGE: 'leads.manage',
  
  // Users
  USERS_CREATE: 'users.create',
  USERS_READ: 'users.read',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE: 'users.manage',
  
  // Roles
  ROLES_CREATE: 'roles.create',
  ROLES_READ: 'roles.read',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_MANAGE: 'roles.manage',
  
  // Customers
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_MANAGE: 'customers.manage',
  
  // Orders
  ORDERS_CREATE: 'orders.create',
  ORDERS_READ: 'orders.read',
  ORDERS_UPDATE: 'orders.update',
  ORDERS_DELETE: 'orders.delete',
  ORDERS_MANAGE: 'orders.manage',
  
  // Quotations
  QUOTATIONS_CREATE: 'quotations.create',
  QUOTATIONS_READ: 'quotations.read',
  QUOTATIONS_UPDATE: 'quotations.update',
  QUOTATIONS_DELETE: 'quotations.delete',
  QUOTATIONS_MANAGE: 'quotations.manage',
  
  // Analytics
  ANALYTICS_READ: 'analytics.read',
  ANALYTICS_MANAGE: 'analytics.manage',

  // Reports (sidebar resource `reports`)
  REPORTS_READ: 'reports.read',
  REPORTS_MANAGE: 'reports.manage',
  
  // Products
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_READ: 'products.read',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',
  PRODUCTS_MANAGE: 'products.manage',
  
  // Lead buckets (sidebar resource `buckets`)
  BUCKETS_CREATE: 'buckets.create',
  BUCKETS_READ: 'buckets.read',
  BUCKETS_UPDATE: 'buckets.update',
  BUCKETS_DELETE: 'buckets.delete',
  BUCKETS_MANAGE: 'buckets.manage',

  // WhatsApp automation flows
  WHATSAPP_AUTOMATION_READ: 'whatsapp_automation.read',
  WHATSAPP_AUTOMATION_CREATE: 'whatsapp_automation.create',
  WHATSAPP_AUTOMATION_UPDATE: 'whatsapp_automation.update',
  WHATSAPP_AUTOMATION_DELETE: 'whatsapp_automation.delete',
  WHATSAPP_AUTOMATION_MANAGE: 'whatsapp_automation.manage',
  WHATSAPP_AUTOMATION_ENROLL: 'whatsapp_automation.enroll',

  // Follow-ups
  FOLLOWUPS_CREATE: 'followups.create',
  FOLLOWUPS_READ: 'followups.read',
  FOLLOWUPS_UPDATE: 'followups.update',
  FOLLOWUPS_DELETE: 'followups.delete',
  FOLLOWUPS_MANAGE: 'followups.manage',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]
