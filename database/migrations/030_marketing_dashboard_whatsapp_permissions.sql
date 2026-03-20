-- Marketing dropdown: Dashboard and WhatsApp as separate permission resources
-- so roles can be granted access to Marketing > Dashboard and/or Marketing > WhatsApp independently.

INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('marketing_dashboard.read', 'marketing_dashboard', 'read', 'View marketing dashboard (overview)'),
    ('marketing_dashboard.manage', 'marketing_dashboard', 'manage', 'Full marketing dashboard access'),
    ('marketing_whatsapp.read', 'marketing_whatsapp', 'read', 'View WhatsApp (templates & bulk)'),
    ('marketing_whatsapp.manage', 'marketing_whatsapp', 'manage', 'Full WhatsApp templates & bulk access')
ON CONFLICT (name) DO NOTHING;

-- Grant to marketing role so existing marketing users see both Dashboard and WhatsApp
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'marketing'
  AND p.name IN ('marketing_dashboard.read', 'marketing_dashboard.manage', 'marketing_whatsapp.read', 'marketing_whatsapp.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;
