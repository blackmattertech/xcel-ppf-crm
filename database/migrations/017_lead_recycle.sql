-- Migration to add lead recycle and re-engagement system
-- This migration adds automatic lead recycling for lost/unqualified leads

-- Create lead_recycle_rules table
CREATE TABLE IF NOT EXISTS public.lead_recycle_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    trigger_status TEXT[], -- Statuses that trigger recycling (e.g., ['lost', 'unqualified'])
    recycle_after_days INTEGER NOT NULL DEFAULT 90, -- Days to wait before recycling
    max_recycle_count INTEGER DEFAULT 3, -- Maximum times a lead can be recycled
    new_status TEXT DEFAULT 'new', -- Status to set when recycled
    auto_enroll_campaign_id UUID REFERENCES public.nurture_campaigns(id), -- Campaign to auto-enroll
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add recycle tracking columns to leads table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'recycle_count'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN recycle_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'last_recycled_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN last_recycled_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'is_recycled'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN is_recycled BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create recycle_history table
CREATE TABLE IF NOT EXISTS public.lead_recycle_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    recycle_rule_id UUID REFERENCES public.lead_recycle_rules(id),
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    recycle_count INTEGER NOT NULL,
    recycled_by UUID REFERENCES public.users(id), -- NULL for automatic
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS lead_recycle_rules_active_idx ON public.lead_recycle_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS lead_recycle_history_lead_id_idx ON public.lead_recycle_history(lead_id);
CREATE INDEX IF NOT EXISTS lead_recycle_history_created_at_idx ON public.lead_recycle_history(created_at);

CREATE INDEX IF NOT EXISTS leads_recycle_count_idx ON public.leads(recycle_count) WHERE recycle_count > 0;
CREATE INDEX IF NOT EXISTS leads_is_recycled_idx ON public.leads(is_recycled) WHERE is_recycled = true;

-- Create trigger for updated_at
CREATE TRIGGER update_lead_recycle_rules_updated_at BEFORE UPDATE ON public.lead_recycle_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to recycle eligible leads
CREATE OR REPLACE FUNCTION recycle_eligible_leads()
RETURNS INTEGER AS $$
DECLARE
    v_rule RECORD;
    v_lead RECORD;
    v_recycled_count INTEGER := 0;
    v_cutoff_date DATE;
BEGIN
    -- Get active recycle rules
    FOR v_rule IN
        SELECT * FROM public.lead_recycle_rules
        WHERE is_active = true
    LOOP
        -- Calculate cutoff date
        v_cutoff_date := CURRENT_DATE - (v_rule.recycle_after_days || 90);
        
        -- Find eligible leads
        FOR v_lead IN
            SELECT l.*
            FROM public.leads l
            WHERE l.status = ANY(v_rule.trigger_status)
            AND (l.last_recycled_at IS NULL OR l.last_recycled_at::DATE <= v_cutoff_date)
            AND (l.recycle_count IS NULL OR l.recycle_count < v_rule.max_recycle_count)
            AND l.is_recycled = false
            LIMIT 100
        LOOP
            -- Update lead status
            UPDATE public.leads
            SET status = v_rule.new_status,
                recycle_count = COALESCE(recycle_count, 0) + 1,
                last_recycled_at = NOW(),
                is_recycled = true,
                updated_at = NOW()
            WHERE id = v_lead.id;
            
            -- Log recycle history
            INSERT INTO public.lead_recycle_history (
                lead_id,
                recycle_rule_id,
                old_status,
                new_status,
                recycle_count,
                notes
            ) VALUES (
                v_lead.id,
                v_rule.id,
                v_lead.status,
                v_rule.new_status,
                COALESCE(v_lead.recycle_count, 0) + 1,
                'Automatically recycled by rule: ' || v_rule.name
            );
            
            -- Auto-enroll in campaign if specified
            IF v_rule.auto_enroll_campaign_id IS NOT NULL THEN
                -- Check if not already enrolled
                IF NOT EXISTS (
                    SELECT 1 FROM public.nurture_enrollments
                    WHERE lead_id = v_lead.id
                    AND campaign_id = v_rule.auto_enroll_campaign_id
                    AND status = 'active'
                ) THEN
                    -- Enroll in campaign (will be handled by application)
                    -- We'll just log it here
                    INSERT INTO public.lead_recycle_history (
                        lead_id,
                        recycle_rule_id,
                        old_status,
                        new_status,
                        recycle_count,
                        notes
                    ) VALUES (
                        v_lead.id,
                        v_rule.id,
                        v_lead.status,
                        v_rule.new_status,
                        COALESCE(v_lead.recycle_count, 0) + 1,
                        'Auto-enrolled in campaign: ' || v_rule.auto_enroll_campaign_id::TEXT
                    );
                END IF;
            END IF;
            
            v_recycled_count := v_recycled_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_recycled_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default recycle rule
INSERT INTO public.lead_recycle_rules (
    name,
    description,
    trigger_status,
    recycle_after_days,
    max_recycle_count,
    new_status,
    is_active
) VALUES (
    'Recycle Lost Leads',
    'Automatically recycle lost leads after 90 days',
    ARRAY['lost'],
    90,
    3,
    'new',
    true
),
(
    'Recycle Unqualified Leads',
    'Automatically recycle unqualified leads after 60 days',
    ARRAY['unqualified'],
    60,
    2,
    'new',
    true
)
ON CONFLICT DO NOTHING;
