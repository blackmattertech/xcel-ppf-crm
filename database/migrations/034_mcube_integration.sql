-- MCUBE telephony: outbound sessions and extended call logs

CREATE TABLE IF NOT EXISTS public.mcube_outbound_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    initiated_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mcube_call_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_lead_id_idx ON public.mcube_outbound_sessions(lead_id);
CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_initiated_by_idx ON public.mcube_outbound_sessions(initiated_by);
CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_mcube_call_id_idx ON public.mcube_outbound_sessions(mcube_call_id) WHERE mcube_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_created_at_idx ON public.mcube_outbound_sessions(created_at DESC);

ALTER TABLE public.calls
    ADD COLUMN IF NOT EXISTS mcube_call_id TEXT,
    ADD COLUMN IF NOT EXISTS recording_url TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS answered_duration_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS dial_status TEXT,
    ADD COLUMN IF NOT EXISTS direction TEXT,
    ADD COLUMN IF NOT EXISTS disconnected_by TEXT,
    ADD COLUMN IF NOT EXISTS mcube_group_name TEXT,
    ADD COLUMN IF NOT EXISTS mcube_agent_name TEXT,
    ADD COLUMN IF NOT EXISTS integration TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS mcube_session_id UUID REFERENCES public.mcube_outbound_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_direction_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_direction_check
    CHECK (direction IS NULL OR direction IN ('inbound', 'outbound'));

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_integration_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_integration_check
    CHECK (integration IN ('manual', 'mcube'));

CREATE UNIQUE INDEX IF NOT EXISTS calls_mcube_call_id_unique ON public.calls(mcube_call_id) WHERE mcube_call_id IS NOT NULL;

COMMENT ON COLUMN public.calls.integration IS 'manual: CRM-logged call; mcube: synced from MCUBE webhook';
COMMENT ON COLUMN public.calls.mcube_session_id IS 'Outbound session when call was initiated from CRM via MCUBE';
