-- Public bucket for WhatsApp inbox/template media (signed uploads + public URLs for Meta to fetch).
-- Prevents "The related resource does not exist" when the bucket was never created in the dashboard.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('template-media', 'template-media', true, 104857600, NULL)
ON CONFLICT (id) DO NOTHING;
