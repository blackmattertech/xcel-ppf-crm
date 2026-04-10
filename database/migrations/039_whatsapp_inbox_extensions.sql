-- Additive inbox extensions for whatsapp_messages (safe, backward-compatible)
-- Supports attachments, conversation grouping, assignment, and unread tracking.

alter table public.whatsapp_messages
  add column if not exists message_type text,
  add column if not exists attachment_url text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_file_name text,
  add column if not exists attachment_size_bytes bigint,
  add column if not exists thumbnail_url text,
  add column if not exists conversation_key text,
  add column if not exists assigned_to uuid references public.users(id) on delete set null,
  add column if not exists is_read boolean,
  add column if not exists read_at timestamptz;

-- Keep values consistent and safe for old rows
update public.whatsapp_messages
set message_type = coalesce(message_type, 'text'),
    conversation_key = coalesce(conversation_key, regexp_replace(phone, '\D', '', 'g')),
    is_read = coalesce(
      is_read,
      case
        when direction = 'out' then true
        when direction = 'in' then false
        else false
      end
    )
where message_type is null
   or conversation_key is null
   or is_read is null;

-- Normalize conversation key whenever present
update public.whatsapp_messages
set conversation_key = regexp_replace(conversation_key, '\D', '', 'g')
where conversation_key is not null
  and conversation_key <> regexp_replace(conversation_key, '\D', '', 'g');

alter table public.whatsapp_messages
  alter column message_type set default 'text',
  alter column is_read set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_messages_message_type_check'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_message_type_check
      check (message_type in ('text', 'image', 'video', 'document'));
  end if;
end $$;

create index if not exists idx_whatsapp_messages_conversation_key_created_at
  on public.whatsapp_messages(conversation_key, created_at desc);

create index if not exists idx_whatsapp_messages_meta_message_id
  on public.whatsapp_messages(meta_message_id);

create index if not exists idx_whatsapp_messages_phone_created_at
  on public.whatsapp_messages(phone, created_at desc);

create index if not exists idx_whatsapp_messages_unread
  on public.whatsapp_messages(conversation_key, created_at desc)
  where is_read = false and direction = 'in';

comment on column public.whatsapp_messages.message_type is 'Message payload type: text, image, video, document.';
comment on column public.whatsapp_messages.conversation_key is 'Normalized phone key used to group messages into a conversation.';
comment on column public.whatsapp_messages.assigned_to is 'User currently assigned to handle the conversation.';
