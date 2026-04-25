-- Add template_name + meta_template_id for accurate analytics joins.
-- We used to infer template from body "[Template: name]" which breaks for multi-line previews.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_messages' and column_name = 'template_name'
  ) then
    alter table public.whatsapp_messages add column template_name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_messages' and column_name = 'meta_template_id'
  ) then
    alter table public.whatsapp_messages add column meta_template_id text;
  end if;
end $$;

create index if not exists whatsapp_messages_template_name_idx on public.whatsapp_messages (template_name);
create index if not exists whatsapp_messages_meta_template_id_idx on public.whatsapp_messages (meta_template_id);

