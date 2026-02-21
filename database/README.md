# Database Migrations

Run migrations in order via **Supabase Dashboard → SQL Editor**.

## WhatsApp Chat (019, 020)

If the `whatsapp_messages` table is missing or chat history is empty after sending messages:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Run `019_whatsapp_messages.sql` first
3. Then run `020_whatsapp_messages_meta_message_id.sql`

Or run this combined SQL in one go:

```sql
-- WhatsApp chat messages table
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  phone text not null,
  direction text not null check (direction in ('out', 'in')),
  body text not null,
  meta_message_id text,
  created_at timestamptz default now()
);

create index if not exists idx_whatsapp_messages_lead_id on public.whatsapp_messages(lead_id);
create index if not exists idx_whatsapp_messages_phone on public.whatsapp_messages(phone);
create index if not exists idx_whatsapp_messages_created_at on public.whatsapp_messages(created_at);
```

### Enable Realtime for whatsapp_messages (instant status updates)

In **Supabase Dashboard → Database → Replication**, add `whatsapp_messages` to the replication list so status updates (sent/delivered/read) appear instantly without polling.

### Add status column (022) – sent/delivered/read receipts

For message status indicators (✓, ✓✓, blue ✓✓), run:

```sql
alter table public.whatsapp_messages add column if not exists status text;
```

### Fix direction constraint (error 23514)

If you see "violates check constraint whatsapp_messages_direction_check", run:

```sql
alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_direction_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_direction_check
  check (direction in ('out', 'in'));
```
