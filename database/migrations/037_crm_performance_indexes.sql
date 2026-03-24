-- Branch and list-pattern indexes; WhatsApp message lookup columns.

CREATE INDEX IF NOT EXISTS leads_branch_id_idx ON public.leads(branch_id)
WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_branch_id_idx ON public.users(branch_id)
WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_assigned_created_idx ON public.leads(assigned_to, created_at DESC)
WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_status_created_idx ON public.leads(status, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_messages_meta_message_id_idx ON public.whatsapp_messages(meta_message_id)
WHERE meta_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_status_created_idx ON public.whatsapp_messages(status, created_at DESC)
WHERE status IS NOT NULL;
