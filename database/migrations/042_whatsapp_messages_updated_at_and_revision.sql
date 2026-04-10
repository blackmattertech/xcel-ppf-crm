-- Track row changes for inbox ETag / conditional GET; any INSERT or UPDATE bumps updated_at.

alter table public.whatsapp_messages
  add column if not exists updated_at timestamptz default now();

update public.whatsapp_messages
set updated_at = coalesce(created_at, now())
where updated_at is null;

create or replace function public.whatsapp_messages_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists whatsapp_messages_set_updated_at on public.whatsapp_messages;
create trigger whatsapp_messages_set_updated_at
  before update on public.whatsapp_messages
  for each row
  execute procedure public.whatsapp_messages_set_updated_at();

comment on column public.whatsapp_messages.updated_at is 'Bumped on every update; used for inbox list ETag / conditional requests.';

-- Single cheap fingerprint for If-None-Match (avoids full conversation list when unchanged).
create or replace function public.whatsapp_inbox_revision()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce(
      (select max(coalesce(updated_at, created_at))::text from public.whatsapp_messages),
      ''
    )
    || '|' ||
    (select count(*)::text from public.whatsapp_messages)
    || '|' ||
    (select count(*)::text from public.whatsapp_messages where direction = 'in' and coalesce(is_read, false) = false)
  );
$$;

grant execute on function public.whatsapp_inbox_revision() to service_role;
grant execute on function public.whatsapp_inbox_revision() to authenticated;
