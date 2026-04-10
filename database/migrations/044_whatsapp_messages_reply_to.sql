-- Store WhatsApp contextual reply (quoted message) by parent wamid for inbox UI.
alter table public.whatsapp_messages
  add column if not exists reply_to_meta_message_id text;

comment on column public.whatsapp_messages.reply_to_meta_message_id is
  'Meta message id (wamid) of the message this row replies to; maps to Cloud API context.message_id.';

create index if not exists idx_whatsapp_messages_reply_to_meta
  on public.whatsapp_messages (reply_to_meta_message_id)
  where reply_to_meta_message_id is not null;
