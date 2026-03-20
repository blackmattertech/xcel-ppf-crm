-- Scheduled WhatsApp template broadcasts (processed by Supabase Edge Function process-whatsapp-scheduled, triggered by pg_cron)

CREATE TABLE IF NOT EXISTS public.scheduled_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_at TIMESTAMPTZ NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_json JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_status_scheduled_at
  ON public.scheduled_broadcasts(status, scheduled_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.scheduled_broadcasts IS 'WhatsApp template broadcasts to be sent at scheduled_at; processed by Supabase Edge Function process-whatsapp-scheduled (see migration 032 for pg_cron).';
