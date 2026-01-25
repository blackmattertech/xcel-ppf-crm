-- Function to generate lead_id
CREATE OR REPLACE FUNCTION generate_lead_id()
RETURNS TRIGGER AS $$
DECLARE
    new_lead_id TEXT;
    counter INTEGER := 1;
BEGIN
    LOOP
        new_lead_id := 'LEAD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
        
        -- Check if this lead_id already exists
        IF NOT EXISTS (SELECT 1 FROM public.leads WHERE lead_id = new_lead_id) THEN
            NEW.lead_id := new_lead_id;
            EXIT;
        END IF;
        
        counter := counter + 1;
        
        -- Safety check to prevent infinite loop
        IF counter > 9999 THEN
            RAISE EXCEPTION 'Unable to generate unique lead_id';
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate lead_id if not provided
CREATE TRIGGER generate_lead_id_trigger
    BEFORE INSERT ON public.leads
    FOR EACH ROW
    WHEN (NEW.lead_id IS NULL OR NEW.lead_id = '')
    EXECUTE FUNCTION generate_lead_id();

-- Function to log lead status changes
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.lead_status_history (lead_id, old_status, new_status, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.assigned_to);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log status changes
CREATE TRIGGER log_lead_status_change_trigger
    AFTER UPDATE OF status ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION log_lead_status_change();

-- Function to update first_contact_at when call is logged
CREATE OR REPLACE FUNCTION update_first_contact_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.leads
    SET first_contact_at = COALESCE(first_contact_at, NOW())
    WHERE id = NEW.lead_id AND first_contact_at IS NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update first_contact_at
CREATE TRIGGER update_first_contact_at_trigger
    AFTER INSERT ON public.calls
    FOR EACH ROW
    EXECUTE FUNCTION update_first_contact_at();

-- Function to auto-expire quotations
CREATE OR REPLACE FUNCTION expire_quotations()
RETURNS void AS $$
BEGIN
    UPDATE public.quotations
    SET status = 'expired'
    WHERE validity_date < CURRENT_DATE
    AND status NOT IN ('accepted', 'expired');
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS) policies will be added in application code
-- For now, we'll rely on application-level security

-- Create function to get next user for round-robin assignment
CREATE OR REPLACE FUNCTION get_next_assigned_user(p_lead_source TEXT)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Get the user with the oldest last_assigned_at for this source
    SELECT user_id INTO v_user_id
    FROM public.assignments
    WHERE lead_source = p_lead_source
    ORDER BY last_assigned_at ASC, assignment_count ASC
    LIMIT 1;
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;
