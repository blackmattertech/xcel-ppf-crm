-- Migration to add lead scoring system
-- This migration adds comprehensive lead scoring with multi-factor analysis

-- Create lead_scores table to store calculated scores
CREATE TABLE IF NOT EXISTS public.lead_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    total_score DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
    demographic_score DECIMAL(5, 2) DEFAULT 0 CHECK (demographic_score >= 0 AND demographic_score <= 100),
    engagement_score DECIMAL(5, 2) DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
    fit_score DECIMAL(5, 2) DEFAULT 0 CHECK (fit_score >= 0 AND fit_score <= 100),
    source_score DECIMAL(5, 2) DEFAULT 0 CHECK (source_score >= 0 AND source_score <= 100),
    last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ,
    score_version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lead_id)
);

-- Create score_factors table to track individual scoring factors
CREATE TABLE IF NOT EXISTS public.score_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_score_id UUID NOT NULL REFERENCES public.lead_scores(id) ON DELETE CASCADE,
    factor_type TEXT NOT NULL, -- 'demographic', 'engagement', 'fit', 'source'
    factor_name TEXT NOT NULL, -- e.g., 'job_title', 'email_opened', 'budget_match'
    factor_value TEXT, -- The actual value
    factor_score DECIMAL(5, 2) NOT NULL, -- Score contribution
    weight DECIMAL(3, 2) DEFAULT 1.0, -- Weight multiplier
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add score column to leads table for quick access
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'lead_score'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN lead_score DECIMAL(5, 2) DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'score_last_updated'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN score_last_updated TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS lead_scores_lead_id_idx ON public.lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS lead_scores_total_score_idx ON public.lead_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS lead_scores_last_calculated_idx ON public.lead_scores(last_calculated_at);
CREATE INDEX IF NOT EXISTS score_factors_lead_score_id_idx ON public.score_factors(lead_score_id);
CREATE INDEX IF NOT EXISTS score_factors_type_idx ON public.score_factors(factor_type);
CREATE INDEX IF NOT EXISTS leads_lead_score_idx ON public.leads(lead_score DESC) WHERE lead_score IS NOT NULL;

-- Create trigger for updated_at on lead_scores
CREATE TRIGGER update_lead_scores_updated_at BEFORE UPDATE ON public.lead_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate demographic score
CREATE OR REPLACE FUNCTION calculate_demographic_score(p_lead_id UUID)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_lead RECORD;
    v_score DECIMAL(5, 2) := 0;
    v_factors INTEGER := 0;
BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Job title scoring (if available in meta_data or requirement)
    -- This is a placeholder - actual scoring logic will be in application code
    -- For now, we'll return a base score
    
    -- Email presence (10 points)
    IF v_lead.email IS NOT NULL AND v_lead.email != '' THEN
        v_score := v_score + 10;
        v_factors := v_factors + 1;
    END IF;
    
    -- Phone presence (10 points)
    IF v_lead.phone IS NOT NULL AND v_lead.phone != '' THEN
        v_score := v_score + 10;
        v_factors := v_factors + 1;
    END IF;
    
    -- Name presence (5 points)
    IF v_lead.name IS NOT NULL AND v_lead.name != '' THEN
        v_score := v_score + 5;
        v_factors := v_factors + 1;
    END IF;
    
    -- Normalize to 0-100 scale (assuming max possible is 25 for basic fields)
    -- More sophisticated scoring will be done in application code
    RETURN LEAST(100, v_score * 4);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate engagement score
CREATE OR REPLACE FUNCTION calculate_engagement_score(p_lead_id UUID)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_calls_count INTEGER;
    v_followups_count INTEGER;
    v_connected_calls INTEGER;
    v_score DECIMAL(5, 2) := 0;
BEGIN
    -- Count total calls
    SELECT COUNT(*) INTO v_calls_count
    FROM public.calls
    WHERE lead_id = p_lead_id;
    
    -- Count connected calls
    SELECT COUNT(*) INTO v_connected_calls
    FROM public.calls
    WHERE lead_id = p_lead_id AND outcome = 'connected';
    
    -- Count follow-ups
    SELECT COUNT(*) INTO v_followups_count
    FROM public.follow_ups
    WHERE lead_id = p_lead_id AND status = 'done';
    
    -- Scoring logic
    -- Each connected call: 15 points
    v_score := v_score + (v_connected_calls * 15);
    
    -- Each completed follow-up: 10 points
    v_score := v_score + (v_followups_count * 10);
    
    -- First contact made: 20 points
    IF v_calls_count > 0 THEN
        v_score := v_score + 20;
    END IF;
    
    -- Cap at 100
    RETURN LEAST(100, v_score);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate fit score
CREATE OR REPLACE FUNCTION calculate_fit_score(p_lead_id UUID)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_lead RECORD;
    v_score DECIMAL(5, 2) := 0;
BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Interest level scoring
    IF v_lead.interest_level = 'hot' THEN
        v_score := v_score + 40;
    ELSIF v_lead.interest_level = 'warm' THEN
        v_score := v_score + 25;
    ELSIF v_lead.interest_level = 'cold' THEN
        v_score := v_score + 10;
    END IF;
    
    -- Budget range presence (20 points)
    IF v_lead.budget_range IS NOT NULL AND v_lead.budget_range != '' THEN
        v_score := v_score + 20;
    END IF;
    
    -- Timeline presence (20 points)
    IF v_lead.timeline IS NOT NULL AND v_lead.timeline != '' THEN
        v_score := v_score + 20;
    END IF;
    
    -- Requirement presence (20 points)
    IF v_lead.requirement IS NOT NULL AND v_lead.requirement != '' THEN
        v_score := v_score + 20;
    END IF;
    
    -- Cap at 100
    RETURN LEAST(100, v_score);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate source score (based on historical conversion rate)
CREATE OR REPLACE FUNCTION calculate_source_score(p_lead_source TEXT)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_total_leads INTEGER;
    v_converted_leads INTEGER;
    v_conversion_rate DECIMAL(5, 2);
    v_score DECIMAL(5, 2);
BEGIN
    -- Get total leads from this source
    SELECT COUNT(*) INTO v_total_leads
    FROM public.leads
    WHERE source = p_lead_source
    AND created_at > NOW() - INTERVAL '90 days'; -- Last 90 days
    
    IF v_total_leads = 0 THEN
        RETURN 50; -- Default score for new sources
    END IF;
    
    -- Get converted leads
    SELECT COUNT(*) INTO v_converted_leads
    FROM public.leads
    WHERE source = p_lead_source
    AND status IN ('converted', 'deal_won', 'fully_paid')
    AND created_at > NOW() - INTERVAL '90 days';
    
    -- Calculate conversion rate
    v_conversion_rate := (v_converted_leads::DECIMAL / v_total_leads::DECIMAL) * 100;
    
    -- Convert to 0-100 score
    -- 0% conversion = 0 points, 30%+ conversion = 100 points
    v_score := LEAST(100, (v_conversion_rate / 30.0) * 100);
    
    RETURN GREATEST(0, v_score);
END;
$$ LANGUAGE plpgsql;

-- Function to recalculate lead score
CREATE OR REPLACE FUNCTION recalculate_lead_score(p_lead_id UUID)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_lead RECORD;
    v_demographic_score DECIMAL(5, 2);
    v_engagement_score DECIMAL(5, 2);
    v_fit_score DECIMAL(5, 2);
    v_source_score DECIMAL(5, 2);
    v_total_score DECIMAL(5, 2);
    v_score_id UUID;
BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Calculate component scores
    v_demographic_score := calculate_demographic_score(p_lead_id);
    v_engagement_score := calculate_engagement_score(p_lead_id);
    v_fit_score := calculate_fit_score(p_lead_id);
    v_source_score := calculate_source_score(v_lead.source);
    
    -- Weighted total: demographic (20%), engagement (30%), fit (25%), source (25%)
    v_total_score := 
        (v_demographic_score * 0.20) +
        (v_engagement_score * 0.30) +
        (v_fit_score * 0.25) +
        (v_source_score * 0.25);
    
    -- Round to 2 decimal places
    v_total_score := ROUND(v_total_score, 2);
    
    -- Upsert score record
    INSERT INTO public.lead_scores (
        lead_id,
        total_score,
        demographic_score,
        engagement_score,
        fit_score,
        source_score,
        last_calculated_at,
        last_activity_at
    ) VALUES (
        p_lead_id,
        v_total_score,
        v_demographic_score,
        v_engagement_score,
        v_fit_score,
        v_source_score,
        NOW(),
        COALESCE(v_lead.first_contact_at, v_lead.updated_at, NOW())
    )
    ON CONFLICT (lead_id) DO UPDATE SET
        total_score = EXCLUDED.total_score,
        demographic_score = EXCLUDED.demographic_score,
        engagement_score = EXCLUDED.engagement_score,
        fit_score = EXCLUDED.fit_score,
        source_score = EXCLUDED.source_score,
        last_calculated_at = EXCLUDED.last_calculated_at,
        last_activity_at = EXCLUDED.last_activity_at,
        updated_at = NOW();
    
    -- Update lead table with score
    UPDATE public.leads
    SET lead_score = v_total_score,
        score_last_updated = NOW()
    WHERE id = p_lead_id;
    
    RETURN v_total_score;
END;
$$ LANGUAGE plpgsql;

-- Function to apply score decay (reduce score if no activity for 7+ days)
CREATE OR REPLACE FUNCTION apply_score_decay()
RETURNS void AS $$
DECLARE
    v_lead RECORD;
    v_days_since_activity INTEGER;
    v_decay_factor DECIMAL(3, 2);
    v_new_score DECIMAL(5, 2);
BEGIN
    FOR v_lead IN
        SELECT l.id, l.lead_score, l.score_last_updated, l.first_contact_at, l.updated_at
        FROM public.leads l
        WHERE l.lead_score > 0
        AND l.status NOT IN ('lost', 'discarded', 'fully_paid', 'converted')
    LOOP
        -- Calculate days since last activity
        v_days_since_activity := EXTRACT(DAY FROM (NOW() - COALESCE(
            v_lead.first_contact_at,
            v_lead.score_last_updated,
            v_lead.updated_at,
            NOW()
        )));
        
        -- Apply decay if inactive for 7+ days
        IF v_days_since_activity >= 7 THEN
            -- Decay: 2% per day after 7 days, max 50% reduction
            v_decay_factor := GREATEST(0.5, 1.0 - ((v_days_since_activity - 7) * 0.02));
            v_new_score := v_lead.lead_score * v_decay_factor;
            
            -- Update score
            UPDATE public.leads
            SET lead_score = ROUND(v_new_score, 2),
                score_last_updated = NOW()
            WHERE id = v_lead.id;
            
            -- Update lead_scores table
            UPDATE public.lead_scores
            SET total_score = ROUND(v_new_score, 2),
                updated_at = NOW()
            WHERE lead_id = v_lead.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
