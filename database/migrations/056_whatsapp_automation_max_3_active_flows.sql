-- Raise max concurrent active WhatsApp automation loops from 2 to 3.

CREATE OR REPLACE FUNCTION public.check_max_active_whatsapp_automation_flows()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = true THEN
        IF (
            SELECT COUNT(*)
            FROM public.whatsapp_automation_flows
            WHERE is_active = true
              AND id IS DISTINCT FROM COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) >= 3 THEN
            RAISE EXCEPTION 'Maximum 3 active WhatsApp automation flows allowed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
