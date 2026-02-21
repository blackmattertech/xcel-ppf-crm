-- Add status column for sent/delivered/read receipts (outgoing messages only)
-- Status updates come from WhatsApp webhook (value.statuses)

alter table public.whatsapp_messages add column if not exists status text;

-- sent < delivered < read (only outgoing messages have status)
comment on column public.whatsapp_messages.status is 'Delivery status for outgoing: sent, delivered, read. Updated via webhook.';
