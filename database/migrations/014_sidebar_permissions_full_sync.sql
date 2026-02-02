-- Sync ALL sidebar options to permissions table so you can give access to users via roles.
-- Every sidebar resource gets .read and .manage; .read is enough to show the menu item.

-- Dashboard (currently requiresPermissions: false; add permission so access can be granted/revoked)
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('dashboard.read', 'dashboard', 'read', 'View dashboard'),
    ('dashboard.manage', 'dashboard', 'manage', 'Full dashboard access')
ON CONFLICT (name) DO NOTHING;

-- Sales pipeline
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('sales.read', 'sales', 'read', 'View sales pipeline'),
    ('sales.manage', 'sales', 'manage', 'Full sales pipeline access')
ON CONFLICT (name) DO NOTHING;

-- Communication
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('communication.read', 'communication', 'read', 'View communication'),
    ('communication.manage', 'communication', 'manage', 'Full communication access')
ON CONFLICT (name) DO NOTHING;

-- Marketing
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('marketing.read', 'marketing', 'read', 'View marketing'),
    ('marketing.manage', 'marketing', 'manage', 'Full marketing access')
ON CONFLICT (name) DO NOTHING;

-- Teams
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('teams.read', 'teams', 'read', 'View teams'),
    ('teams.manage', 'teams', 'manage', 'Full teams access')
ON CONFLICT (name) DO NOTHING;

-- Reports
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('reports.read', 'reports', 'read', 'View reports'),
    ('reports.manage', 'reports', 'manage', 'Full reports access')
ON CONFLICT (name) DO NOTHING;

-- Integrations
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('integrations.read', 'integrations', 'read', 'View integrations'),
    ('integrations.manage', 'integrations', 'manage', 'Full integrations access')
ON CONFLICT (name) DO NOTHING;

-- Ensure followups and products exist (may already be in 010)
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('followups.create', 'followups', 'create', 'Create new followups'),
    ('followups.read', 'followups', 'read', 'View followups'),
    ('followups.update', 'followups', 'update', 'Update followup information'),
    ('followups.delete', 'followups', 'delete', 'Delete followups'),
    ('followups.manage', 'followups', 'manage', 'Full followup management access'),
    ('products.create', 'products', 'create', 'Create new products'),
    ('products.read', 'products', 'read', 'View products'),
    ('products.update', 'products', 'update', 'Update product information'),
    ('products.delete', 'products', 'delete', 'Delete products'),
    ('products.manage', 'products', 'manage', 'Full product management access')
ON CONFLICT (name) DO NOTHING;

-- Grant new sidebar permissions to tele_caller and marketing so they keep seeing these items.
-- You can revoke or grant any of these in Admin > Roles & Permissions.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('tele_caller', 'marketing')
  AND p.name IN (
    'dashboard.read', 'sales.read', 'communication.read', 'marketing.read',
    'teams.read', 'reports.read', 'integrations.read'
  )
ON CONFLICT DO NOTHING;
