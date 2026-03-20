-- Extend whatsapp_templates for template management module: meta_template_id, template_subtype, components, status history.

ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
  ADD COLUMN IF NOT EXISTS correct_category TEXT,
  ADD COLUMN IF NOT EXISTS template_subtype TEXT DEFAULT 'STANDARD' CHECK (
    template_subtype IS NULL OR template_subtype IN (
      'STANDARD', 'AUTHENTICATION_OTP', 'CALL_PERMISSION_REQUEST',
      'CATALOG', 'LIMITED_TIME_OFFER', 'PRODUCT_CARD_CAROUSEL'
    )
  ),
  ADD COLUMN IF NOT EXISTS parameter_format TEXT,
  ADD COLUMN IF NOT EXISTS components_json JSONB,
  ADD COLUMN IF NOT EXISTS normalized_template_json JSONB,
  ADD COLUMN IF NOT EXISTS meta_status TEXT,
  ADD COLUMN IF NOT EXISTS quality_rating TEXT,
  ADD COLUMN IF NOT EXISTS submit_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS languages_json JSONB;

-- Backfill: copy meta_id -> meta_template_id, status -> meta_status for existing rows
UPDATE public.whatsapp_templates
SET meta_template_id = COALESCE(meta_template_id, meta_id),
    meta_status = COALESCE(meta_status, status)
WHERE meta_template_id IS NULL AND meta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_meta_template_id ON public.whatsapp_templates(meta_template_id) WHERE meta_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_template_subtype ON public.whatsapp_templates(template_subtype);

COMMENT ON COLUMN public.whatsapp_templates.meta_template_id IS 'Meta Graph API template ID. Same as meta_id; name aligned with plan.';
COMMENT ON COLUMN public.whatsapp_templates.template_subtype IS 'STANDARD, AUTHENTICATION_OTP, CALL_PERMISSION_REQUEST, CATALOG, LIMITED_TIME_OFFER, PRODUCT_CARD_CAROUSEL.';
