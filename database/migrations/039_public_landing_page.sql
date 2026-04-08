-- Public marketing landing: single-row settings editable from CRM; content served via API.

CREATE TABLE IF NOT EXISTS public.landing_page_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    hero_title TEXT NOT NULL DEFAULT '',
    hero_subtitle TEXT NOT NULL DEFAULT '',
    hero_image_url TEXT,
    form_section_title TEXT NOT NULL DEFAULT 'Get in touch',
    form_button_label TEXT NOT NULL DEFAULT 'Submit',
    form_success_message TEXT NOT NULL DEFAULT 'Thank you! We will contact you soon.',
    form_show_message_field BOOLEAN NOT NULL DEFAULT true,
    video_section_title TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    video_description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.landing_page_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.landing_page_settings ENABLE ROW LEVEL SECURITY;

-- No policies: access only via service role in API routes.

-- Marketing > Landing page permissions
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('marketing_landing.read', 'marketing_landing', 'read', 'View and edit public landing page content'),
    ('marketing_landing.manage', 'marketing_landing', 'manage', 'Full landing page content management')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('marketing', 'admin', 'super_admin')
  AND p.name IN ('marketing_landing.read', 'marketing_landing.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;
