-- Leads: public landing as its own source (shows as "Landing page" in UI)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('meta', 'manual', 'form', 'whatsapp', 'ivr', 'landing'));

-- Round-robin assignments include landing
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_lead_source_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_lead_source_check
  CHECK (lead_source IN ('meta', 'manual', 'form', 'landing'));

-- Landing: configurable form + optional hero video + background mode
ALTER TABLE public.landing_page_settings
  ADD COLUMN IF NOT EXISTS form_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.landing_page_settings
  ADD COLUMN IF NOT EXISTS hero_video_url TEXT;

ALTER TABLE public.landing_page_settings
  ADD COLUMN IF NOT EXISTS hero_background TEXT NOT NULL DEFAULT 'image'
    CHECK (hero_background IN ('image', 'video', 'none'));

-- Remove legacy toggle (replaced by form_fields)
ALTER TABLE public.landing_page_settings
  DROP COLUMN IF EXISTS form_show_message_field;

-- Default form fields for existing rows (matches previous behaviour)
UPDATE public.landing_page_settings
SET form_fields = '[
  {"id":"name","type":"text","label":"Name","placeholder":"Your name","required":true,"mapsTo":"name","order":0},
  {"id":"phone","type":"tel","label":"Phone","placeholder":"Phone number","required":true,"mapsTo":"phone","order":1},
  {"id":"email","type":"email","label":"Email","placeholder":"Email (optional)","required":false,"mapsTo":"email","order":2},
  {"id":"message","type":"textarea","label":"Message","placeholder":"How can we help?","required":false,"mapsTo":"requirement","order":3}
]'::jsonb
WHERE id = 'default' AND jsonb_array_length(form_fields) = 0;

-- Public storage bucket for landing uploads (writes via service role in API)
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-assets', 'landing-assets', true)
ON CONFLICT (id) DO NOTHING;
