-- WhatsApp template drafts: in-progress templates before submission to Meta.
-- Supports STANDARD, AUTHENTICATION_OTP, CALL_PERMISSION_REQUEST, CATALOG, LIMITED_TIME_OFFER, PRODUCT_CARD_CAROUSEL.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  waba_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  template_subtype TEXT NOT NULL DEFAULT 'STANDARD' CHECK (template_subtype IN (
    'STANDARD', 'AUTHENTICATION_OTP', 'CALL_PERMISSION_REQUEST',
    'CATALOG', 'LIMITED_TIME_OFFER', 'PRODUCT_CARD_CAROUSEL'
  )),
  mode TEXT DEFAULT 'custom' CHECK (mode IN ('custom', 'auth_bulk', 'auth_single')),
  name TEXT NOT NULL,
  language TEXT,
  languages_json JSONB,
  parameter_format TEXT CHECK (parameter_format IN ('named', 'positional')),
  components_json JSONB,
  normalized_template_json JSONB,
  validation_errors_json JSONB,
  validation_warnings_json JSONB,
  preview_json JSONB,
  submit_state TEXT NOT NULL DEFAULT 'draft' CHECK (submit_state IN (
    'draft', 'validation_failed', 'ready', 'submitted', 'failed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_template_drafts_created_by ON public.whatsapp_template_drafts(created_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_drafts_submit_state ON public.whatsapp_template_drafts(submit_state);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_drafts_updated_at ON public.whatsapp_template_drafts(updated_at DESC);

DROP TRIGGER IF EXISTS update_whatsapp_template_drafts_updated_at ON public.whatsapp_template_drafts;
CREATE TRIGGER update_whatsapp_template_drafts_updated_at
  BEFORE UPDATE ON public.whatsapp_template_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.whatsapp_template_drafts IS 'Draft WhatsApp message templates before submission to Meta.';
