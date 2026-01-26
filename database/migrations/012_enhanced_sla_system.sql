-- Migration to add enhanced SLA management system
-- This migration adds configurable SLA rules, violation tracking, and escalation management

-- Create SLA rules table for configurable SLA definitions
CREATE TABLE IF NOT EXISTS public.sla_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    lead_source TEXT CHECK (lead_source IN ('meta', 'manual', 'form', 'whatsapp', 'ivr', 'all')),
    interest_level TEXT CHECK (interest_level IN ('hot', 'warm', 'cold', 'all')),
    lead_status TEXT, -- NULL means applies to all statuses
    priority INTEGER NOT NULL DEFAULT 0, -- Higher number = higher priority
    first_contact_minutes INTEGER NOT NULL DEFAULT 5, -- Minutes to first contact
    qualification_hours INTEGER, -- Hours to qualification (NULL = not required)
    followup_response_hours INTEGER, -- Hours to respond to follow-up (NULL = not required)
    quotation_delivery_hours INTEGER, -- Hours to deliver quotation (NULL = not required)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create SLA violations table to track breaches
CREATE TABLE IF NOT EXISTS public.sla_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    sla_rule_id UUID NOT NULL REFERENCES public.sla_rules(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL CHECK (violation_type IN ('first_contact', 'qualification', 'followup_response', 'quotation_delivery')),
    expected_time TIMESTAMPTZ NOT NULL,
    actual_time TIMESTAMPTZ, -- NULL if still violated
    violation_duration_minutes INTEGER, -- Minutes past SLA
    escalation_level INTEGER DEFAULT 0, -- 0 = none, 1 = rep alerted, 2 = supervisor, 3 = auto-reassign
    escalated_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create escalation history table
CREATE TABLE IF NOT EXISTS public.sla_escalations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    violation_id UUID NOT NULL REFERENCES public.sla_violations(id) ON DELETE CASCADE,
    escalation_level INTEGER NOT NULL,
    escalated_to UUID REFERENCES public.users(id), -- User who was notified/escalated to
    action_taken TEXT, -- 'alerted', 'notified', 'reassigned'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add SLA tracking columns to leads table
DO $$ 
BEGIN
  -- Add SLA rule applied to this lead
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'sla_rule_id'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN sla_rule_id UUID REFERENCES public.sla_rules(id);
  END IF;
  
  -- Add SLA deadline tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'sla_first_contact_deadline'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN sla_first_contact_deadline TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'sla_qualification_deadline'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN sla_qualification_deadline TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'sla_followup_response_deadline'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN sla_followup_response_deadline TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'sla_quotation_deadline'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN sla_quotation_deadline TIMESTAMPTZ;
  END IF;
  
  -- Track if lead has active SLA violations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'has_active_sla_violation'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN has_active_sla_violation BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS sla_rules_source_idx ON public.sla_rules(lead_source);
CREATE INDEX IF NOT EXISTS sla_rules_interest_level_idx ON public.sla_rules(interest_level);
CREATE INDEX IF NOT EXISTS sla_rules_priority_idx ON public.sla_rules(priority DESC);
CREATE INDEX IF NOT EXISTS sla_rules_active_idx ON public.sla_rules(is_active);

CREATE INDEX IF NOT EXISTS sla_violations_lead_id_idx ON public.sla_violations(lead_id);
CREATE INDEX IF NOT EXISTS sla_violations_rule_id_idx ON public.sla_violations(sla_rule_id);
CREATE INDEX IF NOT EXISTS sla_violations_type_idx ON public.sla_violations(violation_type);
CREATE INDEX IF NOT EXISTS sla_violations_resolved_idx ON public.sla_violations(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS sla_violations_escalation_idx ON public.sla_violations(escalation_level, resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS sla_escalations_violation_id_idx ON public.sla_escalations(violation_id);
CREATE INDEX IF NOT EXISTS sla_escalations_escalated_to_idx ON public.sla_escalations(escalated_to);

CREATE INDEX IF NOT EXISTS leads_sla_rule_id_idx ON public.leads(sla_rule_id);
CREATE INDEX IF NOT EXISTS leads_sla_violation_idx ON public.leads(has_active_sla_violation) WHERE has_active_sla_violation = true;
CREATE INDEX IF NOT EXISTS leads_sla_deadline_idx ON public.leads(sla_first_contact_deadline) WHERE sla_first_contact_deadline IS NOT NULL;

-- Create trigger for updated_at on sla_rules
CREATE TRIGGER update_sla_rules_updated_at BEFORE UPDATE ON public.sla_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for updated_at on sla_violations
CREATE TRIGGER update_sla_violations_updated_at BEFORE UPDATE ON public.sla_violations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default SLA rules
INSERT INTO public.sla_rules (name, description, lead_source, interest_level, priority, first_contact_minutes, qualification_hours, followup_response_hours, quotation_delivery_hours, is_active) VALUES
('Hot Lead - Fast Response', 'Highest priority for hot leads - 2 minute response', 'all', 'hot', 100, 2, 24, 4, 24, true),
('Warm Lead - Standard Response', 'Standard response for warm leads - 5 minute response', 'all', 'warm', 50, 5, 48, 8, 48, true),
('Cold Lead - Extended Response', 'Extended response time for cold leads - 15 minute response', 'all', 'cold', 10, 15, 72, 24, 72, true),
('Meta Lead - Priority Response', 'High priority for Meta/Facebook leads - 3 minute response', 'meta', 'all', 90, 3, 24, 6, 24, true),
('New Lead - Default', 'Default SLA for new leads without interest level - 5 minute response', 'all', NULL, 30, 5, 48, 8, 48, true)
ON CONFLICT DO NOTHING;

-- Function to get applicable SLA rule for a lead
CREATE OR REPLACE FUNCTION get_applicable_sla_rule(
    p_lead_source TEXT,
    p_interest_level TEXT,
    p_lead_status TEXT
)
RETURNS UUID AS $$
DECLARE
    v_rule_id UUID;
BEGIN
    -- Find the highest priority matching rule
    SELECT id INTO v_rule_id
    FROM public.sla_rules
    WHERE is_active = true
    AND (
        lead_source = p_lead_source OR lead_source = 'all'
    )
    AND (
        interest_level = p_interest_level OR interest_level = 'all' OR (interest_level IS NULL AND p_interest_level IS NULL)
    )
    AND (
        lead_status = p_lead_status OR lead_status IS NULL
    )
    ORDER BY priority DESC, created_at ASC
    LIMIT 1;
    
    RETURN v_rule_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check and create SLA violations
CREATE OR REPLACE FUNCTION check_sla_violations()
RETURNS void AS $$
DECLARE
    v_lead RECORD;
    v_rule RECORD;
    v_violation_id UUID;
    v_violation_duration INTEGER;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Check for first contact violations
    FOR v_lead IN
        SELECT l.id, l.sla_rule_id, l.created_at, l.first_contact_at, l.sla_first_contact_deadline, l.status
        FROM public.leads l
        WHERE l.sla_first_contact_deadline IS NOT NULL
        AND l.first_contact_at IS NULL
        AND l.sla_first_contact_deadline < v_now
        AND l.status NOT IN ('lost', 'discarded', 'fully_paid')
        AND NOT EXISTS (
            SELECT 1 FROM public.sla_violations sv
            WHERE sv.lead_id = l.id
            AND sv.violation_type = 'first_contact'
            AND sv.resolved_at IS NULL
        )
    LOOP
        -- Get the SLA rule
        SELECT * INTO v_rule FROM public.sla_rules WHERE id = v_lead.sla_rule_id;
        
        IF v_rule IS NOT NULL THEN
            v_violation_duration := EXTRACT(EPOCH FROM (v_now - v_lead.sla_first_contact_deadline)) / 60;
            
            INSERT INTO public.sla_violations (
                lead_id, sla_rule_id, violation_type, expected_time, violation_duration_minutes, escalation_level
            ) VALUES (
                v_lead.id, v_rule.id, 'first_contact', v_lead.sla_first_contact_deadline, v_violation_duration, 0
            ) RETURNING id INTO v_violation_id;
            
            -- Update lead flag
            UPDATE public.leads SET has_active_sla_violation = true WHERE id = v_lead.id;
        END IF;
    END LOOP;
    
    -- Check for qualification violations (if lead is still new/unqualified after deadline)
    FOR v_lead IN
        SELECT l.id, l.sla_rule_id, l.created_at, l.status, l.sla_qualification_deadline
        FROM public.leads l
        WHERE l.sla_qualification_deadline IS NOT NULL
        AND l.sla_qualification_deadline < v_now
        AND l.status IN ('new', 'unqualified')
        AND NOT EXISTS (
            SELECT 1 FROM public.sla_violations sv
            WHERE sv.lead_id = l.id
            AND sv.violation_type = 'qualification'
            AND sv.resolved_at IS NULL
        )
    LOOP
        SELECT * INTO v_rule FROM public.sla_rules WHERE id = v_lead.sla_rule_id;
        
        IF v_rule IS NOT NULL AND v_rule.qualification_hours IS NOT NULL THEN
            v_violation_duration := EXTRACT(EPOCH FROM (v_now - v_lead.sla_qualification_deadline)) / 60;
            
            INSERT INTO public.sla_violations (
                lead_id, sla_rule_id, violation_type, expected_time, violation_duration_minutes, escalation_level
            ) VALUES (
                v_lead.id, v_rule.id, 'qualification', v_lead.sla_qualification_deadline, v_violation_duration, 0
            ) RETURNING id INTO v_violation_id;
            
            UPDATE public.leads SET has_active_sla_violation = true WHERE id = v_lead.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to resolve SLA violation when condition is met
CREATE OR REPLACE FUNCTION resolve_sla_violation(
    p_lead_id UUID,
    p_violation_type TEXT,
    p_resolved_by UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE public.sla_violations
    SET resolved_at = NOW(),
        actual_time = NOW(),
        resolved_by = p_resolved_by,
        updated_at = NOW()
    WHERE lead_id = p_lead_id
    AND violation_type = p_violation_type
    AND resolved_at IS NULL;
    
    -- Check if lead has any remaining violations
    UPDATE public.leads
    SET has_active_sla_violation = EXISTS (
        SELECT 1 FROM public.sla_violations
        WHERE lead_id = p_lead_id AND resolved_at IS NULL
    )
    WHERE id = p_lead_id;
END;
$$ LANGUAGE plpgsql;
