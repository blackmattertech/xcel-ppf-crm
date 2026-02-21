-- WhatsApp chat messages (sent + received) for CRM conversation history
-- Incoming messages are stored via webhook; outgoing when sent from Chat tab
-- Uses gen_random_uuid() for compatibility (no extension required; Postgres 13+)

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  phone text not null,
  direction text not null check (direction in ('out', 'in')),
  body text not null,
  meta_message_id text,
  created_at timestamptz default now()
);

-- If table already existed without phone (e.g. partial run), add the column
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_messages' and column_name = 'phone'
  ) then
    alter table public.whatsapp_messages add column phone text not null default '';
  end if;
end $$;

create index if not exists idx_whatsapp_messages_lead_id on public.whatsapp_messages(lead_id);
create index if not exists idx_whatsapp_messages_phone on public.whatsapp_messages(phone);
create index if not exists idx_whatsapp_messages_created_at on public.whatsapp_messages(created_at);

comment on table public.whatsapp_messages is 'WhatsApp conversation history: outgoing (sent from CRM) and incoming (from webhook).';
