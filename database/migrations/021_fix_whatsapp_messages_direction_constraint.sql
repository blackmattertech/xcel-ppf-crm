-- Fix direction check constraint (23514): ensure it accepts 'out' and 'in'
-- Table may have been created with different constraint values (e.g. uppercase)

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_direction_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_direction_check
  check (direction in ('out', 'in'));
