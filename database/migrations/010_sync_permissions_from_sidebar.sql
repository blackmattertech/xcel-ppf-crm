-- Migration to sync permissions from sidebar configuration
-- This ensures permissions exist for all resources defined in the sidebar
-- Run this migration after adding new features to the sidebar

-- Insert permissions for followups (if not exists)
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('followups.create', 'followups', 'create', 'Create new followups'),
    ('followups.read', 'followups', 'read', 'View followups'),
    ('followups.update', 'followups', 'update', 'Update followup information'),
    ('followups.delete', 'followups', 'delete', 'Delete followups'),
    ('followups.manage', 'followups', 'manage', 'Full followup management access')
ON CONFLICT (name) DO NOTHING;

-- Note: Products permissions should already exist from migration 009
-- But we'll ensure they exist here as well
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('products.create', 'products', 'create', 'Create new products'),
    ('products.read', 'products', 'read', 'View products'),
    ('products.update', 'products', 'update', 'Update product information'),
    ('products.delete', 'products', 'delete', 'Delete products'),
    ('products.manage', 'products', 'manage', 'Full product management access')
ON CONFLICT (name) DO NOTHING;

-- Assign followups permissions to tele_caller
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'tele_caller'
    AND p.name LIKE 'followups.%'
ON CONFLICT DO NOTHING;

-- Assign followups.read to admin and super_admin (they already have all permissions, but ensure it)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('admin', 'super_admin')
    AND p.name LIKE 'followups.%'
ON CONFLICT DO NOTHING;
