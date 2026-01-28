-- Create Facebook Business integration settings table
CREATE TABLE IF NOT EXISTS public.facebook_business_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,
    page_id TEXT,
    page_name TEXT,
    ad_account_id TEXT,
    ad_account_name TEXT,
    business_id TEXT,
    business_name TEXT,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id)
);

-- Create index for active connections
CREATE INDEX IF NOT EXISTS facebook_business_settings_active_idx ON public.facebook_business_settings(is_active) WHERE is_active = true;

-- Create index for created_by
CREATE INDEX IF NOT EXISTS facebook_business_settings_created_by_idx ON public.facebook_business_settings(created_by);

-- Create trigger for updated_at
CREATE TRIGGER update_facebook_business_settings_updated_at 
    BEFORE UPDATE ON public.facebook_business_settings
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
