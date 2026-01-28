-- Mailjet integration settings (single global config)

create table if not exists public.mailjet_settings (
  id integer primary key,
  api_key text not null,
  api_secret text not null,
  sender_email text not null,
  updated_at timestamptz not null default now()
);

