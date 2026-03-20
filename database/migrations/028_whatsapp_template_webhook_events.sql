-- Store raw Meta webhook events for template status/category updates. Dedupe by dedupe_key.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id TEXT NOT NULL,
  meta_template_id TEXT,
  event_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_template_webhook_events_dedupe_key
  ON public.whatsapp_template_webhook_events(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_webhook_events_processed
  ON public.whatsapp_template_webhook_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_webhook_events_created_at
  ON public.whatsapp_template_webhook_events(created_at DESC);

COMMENT ON TABLE public.whatsapp_template_webhook_events IS 'Raw Meta webhook events for message_template_status_update, template_category_update.';
