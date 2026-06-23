-- WhatsApp automation flows: admin-defined drip loops (max 2 active), caller enrollment, cron batches.

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    cycle_days INTEGER NOT NULL CHECK (cycle_days >= 1 AND cycle_days <= 30),
    restart_on_complete BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_automation_flows_is_active_idx
    ON public.whatsapp_automation_flows(is_active);

CREATE TRIGGER update_whatsapp_automation_flows_updated_at
    BEFORE UPDATE ON public.whatsapp_automation_flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.check_max_active_whatsapp_automation_flows()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = true THEN
        IF (
            SELECT COUNT(*)
            FROM public.whatsapp_automation_flows
            WHERE is_active = true
              AND id IS DISTINCT FROM COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) >= 2 THEN
            RAISE EXCEPTION 'Maximum 2 active WhatsApp automation flows allowed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_max_active_whatsapp_automation_flows ON public.whatsapp_automation_flows;
CREATE TRIGGER trg_max_active_whatsapp_automation_flows
    BEFORE INSERT OR UPDATE ON public.whatsapp_automation_flows
    FOR EACH ROW EXECUTE FUNCTION public.check_max_active_whatsapp_automation_flows();

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES public.whatsapp_automation_flows(id) ON DELETE CASCADE,
    day_offset INTEGER NOT NULL CHECK (day_offset >= 0 AND day_offset <= 29),
    message_type TEXT NOT NULL CHECK (message_type IN ('template', 'text', 'image', 'video')),
    template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    body_parameters JSONB,
    header_parameters JSONB,
    message_body TEXT,
    media_url TEXT,
    media_mime_type TEXT,
    media_file_name TEXT,
    media_meta_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT whatsapp_automation_triggers_flow_day_unique UNIQUE (flow_id, day_offset)
);

CREATE INDEX IF NOT EXISTS whatsapp_automation_triggers_flow_id_idx
    ON public.whatsapp_automation_triggers(flow_id);

CREATE TRIGGER update_whatsapp_automation_triggers_updated_at
    BEFORE UPDATE ON public.whatsapp_automation_triggers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_bucket_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES public.whatsapp_automation_flows(id) ON DELETE CASCADE,
    bucket_id UUID NOT NULL REFERENCES public.lead_buckets(id) ON DELETE CASCADE,
    linked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT whatsapp_automation_bucket_links_unique UNIQUE (flow_id, bucket_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_automation_bucket_links_bucket_active_idx
    ON public.whatsapp_automation_bucket_links(bucket_id, is_active);

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_lead_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES public.whatsapp_automation_flows(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number >= 1),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    source TEXT NOT NULL CHECK (source IN ('direct', 'bucket')),
    bucket_link_id UUID REFERENCES public.whatsapp_automation_bucket_links(id) ON DELETE SET NULL,
    enrolled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_automation_lead_enrollments_active_unique
    ON public.whatsapp_automation_lead_enrollments(flow_id, lead_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS whatsapp_automation_lead_enrollments_flow_status_idx
    ON public.whatsapp_automation_lead_enrollments(flow_id, status);

CREATE INDEX IF NOT EXISTS whatsapp_automation_lead_enrollments_lead_id_idx
    ON public.whatsapp_automation_lead_enrollments(lead_id);

CREATE TRIGGER update_whatsapp_automation_lead_enrollments_updated_at
    BEFORE UPDATE ON public.whatsapp_automation_lead_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_trigger_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES public.whatsapp_automation_flows(id) ON DELETE CASCADE,
    trigger_id UUID NOT NULL REFERENCES public.whatsapp_automation_triggers(id) ON DELETE CASCADE,
    run_date DATE NOT NULL,
    cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number >= 1),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    payload_json JSONB NOT NULL DEFAULT '{}',
    result_json JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT whatsapp_automation_trigger_batches_unique UNIQUE (flow_id, trigger_id, run_date, cycle_number)
);

CREATE INDEX IF NOT EXISTS whatsapp_automation_trigger_batches_status_scheduled_idx
    ON public.whatsapp_automation_trigger_batches(status, scheduled_at)
    WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_send_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID REFERENCES public.whatsapp_automation_trigger_batches(id) ON DELETE SET NULL,
    enrollment_id UUID REFERENCES public.whatsapp_automation_lead_enrollments(id) ON DELETE SET NULL,
    trigger_id UUID REFERENCES public.whatsapp_automation_triggers(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'retrying')),
    wamid TEXT,
    error TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    cycle_number INTEGER NOT NULL DEFAULT 1,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_automation_send_log_batch_lead_unique
    ON public.whatsapp_automation_send_log(batch_id, lead_id)
    WHERE batch_id IS NOT NULL AND lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_automation_send_log_batch_id_idx
    ON public.whatsapp_automation_send_log(batch_id);

-- Permissions
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('whatsapp_automation.read', 'whatsapp_automation', 'read', 'View WhatsApp automation flows'),
    ('whatsapp_automation.create', 'whatsapp_automation', 'create', 'Create WhatsApp automation flows'),
    ('whatsapp_automation.update', 'whatsapp_automation', 'update', 'Update WhatsApp automation flows'),
    ('whatsapp_automation.delete', 'whatsapp_automation', 'delete', 'Delete WhatsApp automation flows'),
    ('whatsapp_automation.manage', 'whatsapp_automation', 'manage', 'Full WhatsApp automation management'),
    ('whatsapp_automation.enroll', 'whatsapp_automation', 'enroll', 'Enroll leads and buckets in automation flows')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource = 'whatsapp_automation'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'tele_caller'
  AND p.name IN ('whatsapp_automation.read', 'whatsapp_automation.enroll')
ON CONFLICT DO NOTHING;
