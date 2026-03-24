-- Global MCUBE behavior settings
CREATE TABLE IF NOT EXISTS public.mcube_settings (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
    hide_connected_when_last_mcube_not_connected BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.mcube_settings (id, hide_connected_when_last_mcube_not_connected)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS update_mcube_settings_updated_at ON public.mcube_settings;
CREATE TRIGGER update_mcube_settings_updated_at
    BEFORE UPDATE ON public.mcube_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
