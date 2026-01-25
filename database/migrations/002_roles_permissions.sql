-- Insert system roles
INSERT INTO public.roles (id, name, description, is_system_role) VALUES
    (uuid_generate_v4(), 'super_admin', 'Super Administrator with full system access', TRUE),
    (uuid_generate_v4(), 'admin', 'Administrator with management capabilities', TRUE),
    (uuid_generate_v4(), 'marketing', 'Marketing team member', TRUE),
    (uuid_generate_v4(), 'tele_caller', 'Tele-caller role for lead management', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Insert base permissions
INSERT INTO public.permissions (name, resource, action, description) VALUES
    -- Leads permissions
    ('leads.create', 'leads', 'create', 'Create new leads'),
    ('leads.read', 'leads', 'read', 'View leads'),
    ('leads.update', 'leads', 'update', 'Update lead information'),
    ('leads.delete', 'leads', 'delete', 'Delete leads'),
    ('leads.manage', 'leads', 'manage', 'Full lead management access'),
    
    -- Users permissions
    ('users.create', 'users', 'create', 'Create new users'),
    ('users.read', 'users', 'read', 'View users'),
    ('users.update', 'users', 'update', 'Update user information'),
    ('users.delete', 'users', 'delete', 'Delete users'),
    ('users.manage', 'users', 'manage', 'Full user management access'),
    
    -- Roles permissions
    ('roles.create', 'roles', 'create', 'Create new roles'),
    ('roles.read', 'roles', 'read', 'View roles'),
    ('roles.update', 'roles', 'update', 'Update role information'),
    ('roles.delete', 'roles', 'delete', 'Delete roles'),
    ('roles.manage', 'roles', 'manage', 'Full role management access'),
    
    -- Customers permissions
    ('customers.create', 'customers', 'create', 'Create new customers'),
    ('customers.read', 'customers', 'read', 'View customers'),
    ('customers.update', 'customers', 'update', 'Update customer information'),
    ('customers.delete', 'customers', 'delete', 'Delete customers'),
    ('customers.manage', 'customers', 'manage', 'Full customer management access'),
    
    -- Orders permissions
    ('orders.create', 'orders', 'create', 'Create new orders'),
    ('orders.read', 'orders', 'read', 'View orders'),
    ('orders.update', 'orders', 'update', 'Update order information'),
    ('orders.delete', 'orders', 'delete', 'Delete orders'),
    ('orders.manage', 'orders', 'manage', 'Full order management access'),
    
    -- Quotations permissions
    ('quotations.create', 'quotations', 'create', 'Create new quotations'),
    ('quotations.read', 'quotations', 'read', 'View quotations'),
    ('quotations.update', 'quotations', 'update', 'Update quotation information'),
    ('quotations.delete', 'quotations', 'delete', 'Delete quotations'),
    ('quotations.manage', 'quotations', 'manage', 'Full quotation management access'),
    
    -- Analytics permissions
    ('analytics.read', 'analytics', 'read', 'View analytics'),
    ('analytics.manage', 'analytics', 'manage', 'Full analytics access')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to super_admin (all permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Assign permissions to admin (most permissions except role management)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
    AND p.name NOT LIKE 'roles.%'
ON CONFLICT DO NOTHING;

-- Assign permissions to marketing (leads read, customers read, analytics read)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'marketing'
    AND p.name IN ('leads.read', 'leads.create', 'customers.read', 'analytics.read')
ON CONFLICT DO NOTHING;

-- Assign permissions to tele_caller (leads full access, customers read)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'tele_caller'
    AND (p.name LIKE 'leads.%' OR p.name = 'customers.read')
ON CONFLICT DO NOTHING;
