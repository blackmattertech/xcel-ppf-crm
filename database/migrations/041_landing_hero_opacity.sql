-- Hero image/video opacity (0 = invisible, 100 = full strength). Default 40 matches previous image styling.
ALTER TABLE public.landing_page_settings
  ADD COLUMN IF NOT EXISTS hero_background_opacity SMALLINT NOT NULL DEFAULT 40
    CHECK (hero_background_opacity >= 0 AND hero_background_opacity <= 100);
