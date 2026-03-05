-- WhatsApp Business integration settings (link WABA from frontend)
CREATE TABLE IF NOT EXISTS public.whatsapp_business_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    waba_id TEXT NOT NULL,
    waba_name TEXT,
    phone_number_id TEXT NOT NULL,
    phone_number_display TEXT,
    access_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS whatsapp_business_settings_active_idx ON public.whatsapp_business_settings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS whatsapp_business_settings_created_by_idx ON public.whatsapp_business_settings(created_by);

DROP TRIGGER IF EXISTS update_whatsapp_business_settings_updated_at ON public.whatsapp_business_settings;
CREATE TRIGGER update_whatsapp_business_settings_updated_at
    BEFORE UPDATE ON public.whatsapp_business_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.whatsapp_business_settings IS 'WhatsApp Business Account config linked from frontend; env vars used as fallback.';
