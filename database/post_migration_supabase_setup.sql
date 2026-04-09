-- =============================================================================
-- POST-MIGRATION: Supabase Vault, pg_cron, and migration checklist reference
-- =============================================================================
-- Issue: The main schema (including consolidated full_schema_single_migration.sql)
--   must not register pg_cron jobs that call vault.decrypted_secrets until
--   secrets exist — otherwise net.http_post gets a NULL URL and the job is useless.
--
-- Resolution: Run this file ONCE on the new Supabase project AFTER:
--   1) full_schema_single_migration.sql (or all incremental migrations through 031+040)
--   2) Edge Function `process-whatsapp-scheduled` is deployed
--   3) You replace placeholders below with your project URL and anon key
--
-- =============================================================================
-- A) VAULT SECRETS (required for pg_cron → Edge Function)
-- =============================================================================
-- Supabase Dashboard → Project Settings → API:
--   Project URL  → use for project_url (no trailing slash)
--   anon public  → use for anon_key
--
-- Run the two lines below with YOUR values (keep as single quotes).
-- If secrets already exist with these names, drop/update via Dashboard → Database → Vault
-- or use distinct names and change the cron block accordingly.

-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'anon_key');

-- Verify (should return 2 rows after uncommenting and running the above):
-- select name from vault.decrypted_secrets where name in ('project_url', 'anon_key');

-- =============================================================================
-- B) EXTENSIONS + pg_cron JOB (WhatsApp scheduled broadcasts → Edge Function)
-- =============================================================================
-- Dashboard → Database → Extensions: enable "pg_cron" and "pg_net" if the below fails.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  secret_count int;
begin
  select count(*) into secret_count
  from vault.decrypted_secrets
  where name in ('project_url', 'anon_key');
  if secret_count < 2 then
    raise exception
      'Missing vault secrets: uncomment and run section A (project_url + anon_key), then run this file again from section B.';
  end if;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'invoke-process-whatsapp-scheduled') then
    perform cron.unschedule('invoke-process-whatsapp-scheduled');
  end if;
end $$;

-- Every minute: POST to Edge Function (uses anon JWT; function uses service role internally)
select cron.schedule(
  'invoke-process-whatsapp-scheduled',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/process-whatsapp-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Inspect scheduled jobs:
-- select jobid, jobname, schedule, command from cron.job;

-- =============================================================================
-- C) REALTIME (already in migration 040 if you ran full/consolidated schema)
-- =============================================================================
-- If whatsapp_messages changes do not push to clients, ensure publication exists:
-- select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'whatsapp_messages';

-- =============================================================================
-- D) STORAGE BUCKETS (manual — not in SQL migrations)
-- =============================================================================
-- Dashboard → Storage → New bucket:
--   - product-images   (public) — product image uploads
--   - template-media   (public) — WhatsApp template header media / signed uploads
--   - user-profiles    — profile images (app expects this name)
--
-- Match policies to your security model (public read vs signed URLs only).

-- =============================================================================
-- E) APP-LEVEL CRON (hosting / CI — NOT in Postgres)
-- =============================================================================
-- These hit your Next.js deployment (APP_BASE_URL), not Supabase SQL.
--
-- 1) WhatsApp scheduled broadcasts (alternative to pg_cron + Edge Function)
--    GET  {APP_BASE_URL}/api/cron/whatsapp-process-scheduled
--    Auth: Authorization: Bearer {CRON_SECRET or WHATSAPP_PROCESS_SCHEDULED_SECRET}
--    Or Vercel: header x-vercel-cron: 1
--    Internally calls /api/marketing/whatsapp/process-scheduled?secret=...
--
-- 2) Meta Lead Ads pull
--    GET  {APP_BASE_URL}/api/cron/meta-leads-sync
--    Auth: Bearer CRON_SECRET (or x-vercel-cron on Vercel)
--    Schedule example: every 6 hours — see .github/workflows/meta-leads-sync.yml
--
-- 3) WhatsApp template status sync (Meta)
--    GET/POST {APP_BASE_URL}/api/cron/whatsapp-template-sync
--    Auth: Bearer CRON_SECRET when CRON_SECRET is set
--
-- GitHub Actions (repo .github/workflows/):
--   whatsapp-scheduler.yml     → */5 * * * * UTC → /api/cron/whatsapp-process-scheduled
--   meta-leads-sync.yml        → 0 */6 * * * UTC → /api/cron/meta-leads-sync
--   WhatsApp Scheduled Processor.yml → * * * * * (every minute) — duplicate workflow; pick one
--
-- After migrating: set repo secrets APP_BASE_URL and CRON_SECRET to the NEW production URL and secret.

-- =============================================================================
-- F) EDGE FUNCTION deploy (CLI — not SQL)
-- =============================================================================
--   supabase link --project-ref YOUR_PROJECT_REF
--   supabase functions deploy process-whatsapp-scheduled
-- Optional secrets if no whatsapp_business_settings row (see function README):
--   supabase secrets set WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_ACCESS_TOKEN=...

-- =============================================================================
-- G) ENV VARS to update for new Supabase + Meta (.env / hosting)
-- =============================================================================
--   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
--   SUPABASE_SERVICE_ROLE_KEY
--   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET (and/or META_* if used)
--   CRON_SECRET, WHATSAPP_PROCESS_SCHEDULED_SECRET (optional override)
--   WhatsApp Cloud API fallbacks if used: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, etc.
-- Reconnect Facebook + WhatsApp in app Settings so DB rows are created on the new project.
