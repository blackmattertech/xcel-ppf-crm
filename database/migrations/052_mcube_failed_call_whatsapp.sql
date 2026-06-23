-- Auto-send WhatsApp template when MCube outbound call is not answered / not connected / not reachable.

ALTER TABLE public.mcube_settings
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_body_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_header_parameters JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.mcube_settings.failed_call_whatsapp_enabled IS 'When true, send configured WhatsApp template after failed MCube outbound calls.';
COMMENT ON COLUMN public.mcube_settings.failed_call_whatsapp_template_id IS 'Approved whatsapp_templates.id to send on failed outbound MCube hangup.';
COMMENT ON COLUMN public.mcube_settings.failed_call_whatsapp_body_parameters IS 'JSON array of template body params; use {{lead_name}} for lead name token.';
COMMENT ON COLUMN public.mcube_settings.failed_call_whatsapp_header_parameters IS 'JSON array of template header params (text or media URL).';

CREATE TABLE IF NOT EXISTS public.mcube_failed_call_whatsapp_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
    mcube_call_id TEXT NOT NULL,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
    wamid TEXT,
    error TEXT,
    dial_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mcube_failed_call_whatsapp_log_mcube_call_unique UNIQUE (mcube_call_id)
);

CREATE INDEX IF NOT EXISTS mcube_failed_call_whatsapp_log_lead_id_idx
    ON public.mcube_failed_call_whatsapp_log(lead_id);

CREATE INDEX IF NOT EXISTS mcube_failed_call_whatsapp_log_created_at_idx
    ON public.mcube_failed_call_whatsapp_log(created_at DESC);
