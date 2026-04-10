-- Allow delivery status 'read' (and 'failed') on whatsapp_messages.status.
-- Some DBs had a check constraint listing only sent/delivered, which caused
-- updateMessageStatus(..., 'read') to fail with 23514.

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_status_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_status_check
  check (
    status is null
    or status in ('sent', 'delivered', 'read', 'failed')
  );

comment on constraint whatsapp_messages_status_check on public.whatsapp_messages is
  'Outgoing delivery status from Meta webhooks: sent, delivered, read, failed. Null for incoming.';
