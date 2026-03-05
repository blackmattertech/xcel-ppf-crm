-- Page Access Token is required for leadgen API (/{page-id}/leadgen_forms, /{form-id}/leads).
-- User token remains in access_token for Marketing API (ads insights, campaigns).
ALTER TABLE public.facebook_business_settings
ADD COLUMN IF NOT EXISTS page_access_token TEXT;

COMMENT ON COLUMN public.facebook_business_settings.page_access_token IS 'Page Access Token for leadgen forms/leads API; access_token is User token for ads API';
