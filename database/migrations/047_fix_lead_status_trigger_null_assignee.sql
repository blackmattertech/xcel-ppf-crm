-- Status-change trigger used changed_by = NEW.assigned_to. When assigned_to IS NULL,
-- INSERT violated lead_status_history.changed_by NOT NULL and rolled back the whole UPDATE (500 on PUT /api/leads/[id]).
-- Skip automatic history in that case; application logs with the authenticated user (see updateLead).

CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.lead_status_history (lead_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.assigned_to);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
