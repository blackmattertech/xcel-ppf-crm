-- History of template status/category changes from webhook, poll, or manual.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_template_id UUID NOT NULL REFERENCES public.whatsapp_templates(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  old_category TEXT,
  new_category TEXT,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'poll', 'manual')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_template_status_history_template_id
  ON public.whatsapp_template_status_history(whatsapp_template_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_status_history_created_at
  ON public.whatsapp_template_status_history(created_at DESC);

COMMENT ON TABLE public.whatsapp_template_status_history IS 'Audit trail for template status and category changes.';
