-- Store Meta upload media ID for template header (from Resumable Upload API).
-- Use this when sending template so we send image: { id } instead of link.

alter table public.whatsapp_templates
  add column if not exists header_media_id text;

comment on column public.whatsapp_templates.header_media_id is 'Meta media attachment ID from Resumable Upload API; use when sending template (image/video/document).';
