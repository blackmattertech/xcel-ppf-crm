-- Migration to add unified activity timeline
-- This migration creates a comprehensive activity tracking system

-- Create lead_activities table for unified activity timeline
CREATE TABLE IF NOT EXISTS public.lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'call', 'email', 'sms', 'whatsapp', 'meeting', 'note', 
        'status_change', 'assignment', 'followup_created', 'followup_completed',
        'quotation_sent', 'quotation_viewed', 'quotation_accepted',
        'file_uploaded', 'custom'
    )),
    activity_subtype TEXT, -- e.g., 'call_connected', 'email_sent', 'email_received'
    title TEXT NOT NULL,
    description TEXT,
    performed_by UUID REFERENCES public.users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB, -- Additional activity data
    related_entity_type TEXT, -- 'call', 'followup', 'quotation', etc.
    related_entity_id UUID, -- ID of related entity
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS lead_activities_lead_id_idx ON public.lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS lead_activities_type_idx ON public.lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS lead_activities_performed_at_idx ON public.lead_activities(performed_at DESC);
CREATE INDEX IF NOT EXISTS lead_activities_performed_by_idx ON public.lead_activities(performed_by);
CREATE INDEX IF NOT EXISTS lead_activities_related_entity_idx ON public.lead_activities(related_entity_type, related_entity_id) WHERE related_entity_type IS NOT NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_lead_activities_updated_at BEFORE UPDATE ON public.lead_activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log activity automatically
CREATE OR REPLACE FUNCTION log_lead_activity(
    p_lead_id UUID,
    p_activity_type TEXT,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_performed_by UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_related_entity_type TEXT DEFAULT NULL,
    p_related_entity_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
BEGIN
    INSERT INTO public.lead_activities (
        lead_id,
        activity_type,
        title,
        description,
        performed_by,
        performed_at,
        metadata,
        related_entity_type,
        related_entity_id
    ) VALUES (
        p_lead_id,
        p_activity_type,
        p_title,
        p_description,
        p_performed_by,
        NOW(),
        p_metadata,
        p_related_entity_type,
        p_related_entity_id
    ) RETURNING id INTO v_activity_id;
    
    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log call activities
CREATE OR REPLACE FUNCTION log_call_activity()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM log_lead_activity(
        NEW.lead_id,
        'call',
        CASE 
            WHEN NEW.outcome = 'connected' THEN 'Call Connected'
            WHEN NEW.outcome = 'not_reachable' THEN 'Call - Not Reachable'
            WHEN NEW.outcome = 'wrong_number' THEN 'Call - Wrong Number'
            WHEN NEW.outcome = 'call_later' THEN 'Call - Call Later'
            ELSE 'Call Made'
        END,
        COALESCE(NEW.notes, ''),
        NEW.called_by,
        jsonb_build_object(
            'outcome', NEW.outcome,
            'disposition', NEW.disposition,
            'call_duration', NEW.call_duration
        ),
        'call',
        NEW.id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_call_activity_trigger
    AFTER INSERT ON public.calls
    FOR EACH ROW
    EXECUTE FUNCTION log_call_activity();

-- Trigger to log follow-up activities
CREATE OR REPLACE FUNCTION log_followup_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM log_lead_activity(
            NEW.lead_id,
            'followup_created',
            'Follow-up Scheduled',
            COALESCE(NEW.notes, ''),
            NEW.assigned_to,
            jsonb_build_object(
                'scheduled_at', NEW.scheduled_at,
                'status', NEW.status
            ),
            'followup',
            NEW.id
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status = 'done' THEN
        PERFORM log_lead_activity(
            NEW.lead_id,
            'followup_completed',
            'Follow-up Completed',
            COALESCE(NEW.notes, ''),
            NEW.assigned_to,
            jsonb_build_object(
                'scheduled_at', NEW.scheduled_at,
                'completed_at', NEW.completed_at
            ),
            'followup',
            NEW.id
        );
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_followup_activity_trigger
    AFTER INSERT OR UPDATE ON public.follow_ups
    FOR EACH ROW
    EXECUTE FUNCTION log_followup_activity();

-- Trigger to log status change activities (enhance existing)
CREATE OR REPLACE FUNCTION log_status_change_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM log_lead_activity(
            NEW.id,
            'status_change',
            'Status Changed',
            'Status changed from ' || COALESCE(OLD.status, 'N/A') || ' to ' || NEW.status,
            NEW.assigned_to,
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status
            ),
            'lead',
            NEW.id
        );
    END IF;
    
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        PERFORM log_lead_activity(
            NEW.id,
            'assignment',
            'Lead Assigned',
            'Lead assigned to new user',
            NULL, -- System assignment
            jsonb_build_object(
                'old_assigned_to', OLD.assigned_to,
                'new_assigned_to', NEW.assigned_to
            ),
            'lead',
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS log_status_change_activity_trigger ON public.leads;
CREATE TRIGGER log_status_change_activity_trigger
    AFTER UPDATE OF status, assigned_to ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION log_status_change_activity();

-- Trigger to log quotation activities
CREATE OR REPLACE FUNCTION log_quotation_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM log_lead_activity(
            NEW.lead_id,
            'quotation_sent',
            'Quotation Sent',
            'Quotation ' || NEW.quote_number || ' sent',
            NEW.created_by,
            jsonb_build_object(
                'quote_number', NEW.quote_number,
                'total', NEW.total,
                'validity_date', NEW.validity_date
            ),
            'quotation',
            NEW.id
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        IF NEW.status = 'viewed' THEN
            PERFORM log_lead_activity(
                NEW.lead_id,
                'quotation_viewed',
                'Quotation Viewed',
                'Quotation ' || NEW.quote_number || ' was viewed',
                NULL,
                jsonb_build_object(
                    'quote_number', NEW.quote_number
                ),
                'quotation',
                NEW.id
            );
        ELSIF NEW.status = 'accepted' THEN
            PERFORM log_lead_activity(
                NEW.lead_id,
                'quotation_accepted',
                'Quotation Accepted',
                'Quotation ' || NEW.quote_number || ' was accepted',
                NULL,
                jsonb_build_object(
                    'quote_number', NEW.quote_number,
                    'total', NEW.total
                ),
                'quotation',
                NEW.id
            );
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_quotation_activity_trigger
    AFTER INSERT OR UPDATE OF status ON public.quotations
    FOR EACH ROW
    EXECUTE FUNCTION log_quotation_activity();
