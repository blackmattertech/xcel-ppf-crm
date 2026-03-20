# process-whatsapp-scheduled

Supabase Edge Function that processes **scheduled WhatsApp broadcasts** from the `scheduled_broadcasts` table. When run, it picks up to 5 due jobs (where `scheduled_at <= now()` and `status = 'pending'`), loads WhatsApp config from `whatsapp_business_settings` (or env), and sends template messages via the Meta WhatsApp Cloud API.

## How it fits

1. **Schedule in the app**  
   In **Marketing → Bulk WhatsApp**, set "Schedule for" and click "Schedule broadcast". The Next.js app writes one row to `scheduled_broadcasts` with a resolved payload (template, recipients, delay, etc.).

2. **Cron runs every minute**  
   **pg_cron** (see migration `032_pg_cron_whatsapp_scheduled.sql`) calls this Edge Function every minute via **pg_net** (HTTP POST to your project’s `/functions/v1/process-whatsapp-scheduled`).

3. **This function**  
   Runs when invoked: reads due jobs, gets WhatsApp config (DB or env), sends each message with the configured delay, and updates job status to `completed` or `failed`.

So you can **schedule multiple messages at once** in the app; Supabase cron + this function send them at the scheduled time.

## Deploy

```bash
# From project root
supabase functions deploy process-whatsapp-scheduled
```

Optional: set Edge Function secrets for WhatsApp (fallback when no `created_by` or no DB config):

```bash
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
supabase secrets set WHATSAPP_ACCESS_TOKEN=your_access_token
```

## Cron setup (one-time)

1. **Vault secrets**  
   In Supabase Dashboard → SQL Editor (or any SQL client), run (replace with your project URL and anon key):

   ```sql
   select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
   select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'anon_key');
   ```

2. **Run migration 032**  
   Run `database/migrations/032_pg_cron_whatsapp_scheduled.sql` so that pg_cron invokes this Edge Function every minute.

After that, scheduled broadcasts will be processed automatically at the scheduled time.

## Manual trigger

You can still call your **Next.js** endpoint to process due jobs (e.g. "Process scheduled broadcasts now" on the Bulk WhatsApp page), or call this Edge Function directly:

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-whatsapp-scheduled' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```
