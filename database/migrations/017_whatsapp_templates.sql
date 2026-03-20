-- WhatsApp message templates (design, submit to Meta, use for bulk broadcast)
-- Template name must be unique per language; status tracks Meta review.

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null default 'en',
  category text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  body_text text not null,
  header_text text,
  footer_text text,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  meta_id text,
  rejection_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, language)
);

create index if not exists idx_whatsapp_templates_status on public.whatsapp_templates(status);
create index if not exists idx_whatsapp_templates_created_by on public.whatsapp_templates(created_by);

comment on table public.whatsapp_templates is 'WhatsApp message templates for bulk broadcast; submit to Meta for approval.';
