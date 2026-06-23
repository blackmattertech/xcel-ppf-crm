-- Failed-call WhatsApp: support template, text, image, and video message types.

ALTER TABLE public.mcube_settings
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_message_type TEXT NOT NULL DEFAULT 'template'
        CHECK (failed_call_whatsapp_message_type IN ('template', 'text', 'image', 'video')),
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_message_body TEXT,
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_media_url TEXT,
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_media_mime_type TEXT,
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_media_file_name TEXT,
    ADD COLUMN IF NOT EXISTS failed_call_whatsapp_media_meta_id TEXT;

COMMENT ON COLUMN public.mcube_settings.failed_call_whatsapp_message_type IS 'template | text | image | video — message sent after failed outbound MCube call.';
COMMENT ON COLUMN public.mcube_settings.failed_call_whatsapp_message_body IS 'Text body or image/video caption; supports {{lead_name}} token.';

ALTER TABLE public.mcube_failed_call_whatsapp_log
    ADD COLUMN IF NOT EXISTS message_type TEXT
        CHECK (message_type IS NULL OR message_type IN ('template', 'text', 'image', 'video'));
