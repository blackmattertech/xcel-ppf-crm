-- Add meta_message_id to whatsapp_messages if missing (PGRST204: column not in schema cache)
-- Table may have been created before 019 included this column, or by an older migration

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_messages' and column_name = 'meta_message_id'
  ) then
    alter table public.whatsapp_messages add column meta_message_id text;
  end if;
end $$;
