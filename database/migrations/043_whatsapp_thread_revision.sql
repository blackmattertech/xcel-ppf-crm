-- Fingerprint for GET /chat (messages) If-None-Match — matches conversation thread filters.

create or replace function public.whatsapp_thread_revision(
  p_conversation_key text default null,
  p_lead_id uuid default null,
  p_phone text default null
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with thread as (
    select m.*
    from public.whatsapp_messages m
    where
      case
        when p_conversation_key is not null then
          m.conversation_key = p_conversation_key
        when p_lead_id is not null or p_phone is not null then
          (p_lead_id is not null and m.lead_id = p_lead_id)
          or (p_phone is not null and m.phone = p_phone)
        else
          false
      end
  )
  select md5(
    coalesce((select max(coalesce(updated_at, created_at))::text from thread), '') ||
    '|' ||
    (select count(*)::text from thread) ||
    '|' ||
    (select count(*)::text from thread where direction = 'in' and coalesce(is_read, false) = false)
  );
$$;

grant execute on function public.whatsapp_thread_revision(text, uuid, text) to service_role;
grant execute on function public.whatsapp_thread_revision(text, uuid, text) to authenticated;
