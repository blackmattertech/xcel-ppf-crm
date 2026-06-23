-- Lead buckets: admin-defined labels; callers/admins tag leads without touching status/journey.

CREATE TABLE IF NOT EXISTS public.lead_buckets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_buckets_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS lead_buckets_is_active_idx ON public.lead_buckets(is_active);
CREATE INDEX IF NOT EXISTS lead_buckets_sort_order_idx ON public.lead_buckets(sort_order);

CREATE TRIGGER update_lead_buckets_updated_at
    BEFORE UPDATE ON public.lead_buckets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.lead_bucket_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    bucket_id UUID NOT NULL REFERENCES public.lead_buckets(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_bucket_assignments_unique UNIQUE (lead_id, bucket_id)
);

CREATE INDEX IF NOT EXISTS lead_bucket_assignments_lead_id_idx ON public.lead_bucket_assignments(lead_id);
CREATE INDEX IF NOT EXISTS lead_bucket_assignments_bucket_id_idx ON public.lead_bucket_assignments(bucket_id);

-- Permissions for sidebar resource `buckets`
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('buckets.create', 'buckets', 'create', 'Create lead buckets'),
    ('buckets.read', 'buckets', 'read', 'View lead buckets'),
    ('buckets.update', 'buckets', 'update', 'Update lead buckets'),
    ('buckets.delete', 'buckets', 'delete', 'Delete lead buckets'),
    ('buckets.manage', 'buckets', 'manage', 'Full lead bucket management')
ON CONFLICT (name) DO NOTHING;

-- Admin roles: full bucket management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource = 'buckets'
ON CONFLICT DO NOTHING;

-- Tele-callers: read buckets (to tag leads); assignment uses leads.update
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'tele_caller'
  AND p.name = 'buckets.read'
ON CONFLICT DO NOTHING;
