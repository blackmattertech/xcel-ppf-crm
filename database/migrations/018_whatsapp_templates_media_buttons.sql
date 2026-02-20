-- Add header media and buttons support for WhatsApp message templates

alter table public.whatsapp_templates
  add column if not exists header_format text default 'TEXT' check (header_format in ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT')),
  add column if not exists header_media_url text,
  add column if not exists buttons jsonb default '[]'::jsonb;

comment on column public.whatsapp_templates.header_format is 'HEADER type: TEXT or IMAGE, VIDEO, DOCUMENT';
comment on column public.whatsapp_templates.header_media_url is 'Sample media URL for header (required for IMAGE/VIDEO/DOCUMENT)';
comment on column public.whatsapp_templates.buttons is 'Array of { type: QUICK_REPLY|URL|PHONE_NUMBER|COPY_CODE, text: string, example?: string }';
