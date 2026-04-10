-- Sender phone/id of the quoted message (Meta `context.from`) — used when parent row is missing or for label when wamids differ.
alter table public.whatsapp_messages
  add column if not exists reply_context_from text;

comment on column public.whatsapp_messages.reply_context_from is
  'Meta context.from for replies: who sent the quoted message (digits). Helps CRM match WhatsApp quote UI when parent wamid lookup differs.';
