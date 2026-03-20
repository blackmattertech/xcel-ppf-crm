-- Schedule Supabase Edge Function process-whatsapp-scheduled every minute via pg_cron + pg_net.
-- Prerequisites:
--   1. Deploy Edge Function: supabase functions deploy process-whatsapp-scheduled
--   2. Add vault secrets (Supabase Dashboard → SQL or run below with your values):
--        select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--        select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'anon_key');
--   3. Then run this migration.
-- If extensions fail, enable "pg_cron" and "pg_net" in Dashboard → Database → Extensions.

-- Enable extensions (idempotent; may already exist)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove existing schedule if present (so re-running is safe)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'invoke-process-whatsapp-scheduled') then
    perform cron.unschedule('invoke-process-whatsapp-scheduled');
  end if;
end $$;

-- Invoke Edge Function every minute
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
