-- Failed-call WhatsApp: optional caller approval before send (popup stopper).

ALTER TABLE public.mcube_settings
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_require_caller_approval BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.mcube_settings.failed_call_whatsapp_require_caller_approval IS
    'When true, caller who made the failed MCube call must approve before WhatsApp follow-up is sent.';

CREATE TABLE IF NOT EXISTS public.mcube_failed_call_whatsapp_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
    mcube_call_id TEXT NOT NULL,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    caller_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dial_status TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'dismissed', 'sent', 'failed', 'expired')),
    message_preview TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    responded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT mcube_failed_call_whatsapp_prompts_mcube_call_unique UNIQUE (mcube_call_id)
);

CREATE INDEX IF NOT EXISTS mcube_failed_call_whatsapp_prompts_caller_pending_idx
    ON public.mcube_failed_call_whatsapp_prompts(caller_user_id, created_at DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS mcube_failed_call_whatsapp_prompts_lead_id_idx
    ON public.mcube_failed_call_whatsapp_prompts(lead_id);

ALTER TABLE public.mcube_failed_call_whatsapp_log
    DROP CONSTRAINT IF EXISTS mcube_failed_call_whatsapp_log_status_check;

ALTER TABLE public.mcube_failed_call_whatsapp_log
    ADD CONSTRAINT mcube_failed_call_whatsapp_log_status_check
    CHECK (status IN ('sent', 'failed', 'dismissed'));
