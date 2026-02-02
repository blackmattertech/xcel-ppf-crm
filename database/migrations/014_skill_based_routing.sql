-- Migration to add skill-based routing system
-- This migration adds user skills, expertise tags, and skill-based assignment rules

-- Create user_skills table to store rep expertise
CREATE TABLE IF NOT EXISTS public.user_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    skill_type TEXT NOT NULL, -- 'product', 'industry', 'language', 'territory', 'expertise'
    skill_name TEXT NOT NULL, -- e.g., 'automotive', 'hindi', 'north_india', 'premium_products'
    skill_level INTEGER DEFAULT 5 CHECK (skill_level >= 1 AND skill_level <= 10), -- 1-10 proficiency
    is_primary BOOLEAN DEFAULT false, -- Primary skill vs secondary
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill_type, skill_name)
);

-- Create assignment_rules table for complex assignment logic
CREATE TABLE IF NOT EXISTS public.assignment_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 0, -- Higher = higher priority
    lead_source TEXT CHECK (lead_source IN ('meta', 'manual', 'form', 'whatsapp', 'ivr', 'all')),
    lead_requirement TEXT, -- Match against lead.requirement or meta_data
    required_skill_type TEXT, -- 'product', 'industry', 'language', etc.
    required_skill_name TEXT, -- Specific skill required
    territory TEXT, -- Geographic territory
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add territory/geography field to leads table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'territory'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN territory TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN preferred_language TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'industry'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN industry TEXT;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS user_skills_user_id_idx ON public.user_skills(user_id);
CREATE INDEX IF NOT EXISTS user_skills_type_idx ON public.user_skills(skill_type);
CREATE INDEX IF NOT EXISTS user_skills_name_idx ON public.user_skills(skill_name);
CREATE INDEX IF NOT EXISTS user_skills_primary_idx ON public.user_skills(user_id, is_primary) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS assignment_rules_priority_idx ON public.assignment_rules(priority DESC);
CREATE INDEX IF NOT EXISTS assignment_rules_active_idx ON public.assignment_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS assignment_rules_source_idx ON public.assignment_rules(lead_source);

CREATE INDEX IF NOT EXISTS leads_territory_idx ON public.leads(territory) WHERE territory IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_language_idx ON public.leads(preferred_language) WHERE preferred_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_industry_idx ON public.leads(industry) WHERE industry IS NOT NULL;

-- Create trigger for updated_at on user_skills
CREATE TRIGGER update_user_skills_updated_at BEFORE UPDATE ON public.user_skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for updated_at on assignment_rules
CREATE TRIGGER update_assignment_rules_updated_at BEFORE UPDATE ON public.assignment_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to find users matching lead requirements
CREATE OR REPLACE FUNCTION find_matching_users_for_lead(
    p_lead_id UUID
)
RETURNS TABLE (
    user_id UUID,
    match_score DECIMAL(5, 2),
    match_reasons TEXT[]
) AS $$
DECLARE
    v_lead RECORD;
    v_user RECORD;
    v_match_score DECIMAL(5, 2);
    v_reasons TEXT[];
    v_skill_match BOOLEAN;
BEGIN
    -- Get lead details
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Get all tele_callers
    FOR v_user IN
        SELECT u.id
        FROM public.users u
        JOIN public.roles r ON u.role_id = r.id
        WHERE r.name = 'tele_caller'
    LOOP
        v_match_score := 0;
        v_reasons := ARRAY[]::TEXT[];
        v_skill_match := false;
        
        -- Check territory match
        IF v_lead.territory IS NOT NULL THEN
            SELECT EXISTS(
                SELECT 1 FROM public.user_skills
                WHERE user_id = v_user.id
                AND skill_type = 'territory'
                AND skill_name = v_lead.territory
            ) INTO v_skill_match;
            
            IF v_skill_match THEN
                v_match_score := v_match_score + 30;
                v_reasons := array_append(v_reasons, 'Territory match');
            END IF;
        END IF;
        
        -- Check language match
        IF v_lead.preferred_language IS NOT NULL THEN
            SELECT EXISTS(
                SELECT 1 FROM public.user_skills
                WHERE user_id = v_user.id
                AND skill_type = 'language'
                AND skill_name = v_lead.preferred_language
            ) INTO v_skill_match;
            
            IF v_skill_match THEN
                v_match_score := v_match_score + 25;
                v_reasons := array_append(v_reasons, 'Language match');
            END IF;
        END IF;
        
        -- Check industry match
        IF v_lead.industry IS NOT NULL THEN
            SELECT EXISTS(
                SELECT 1 FROM public.user_skills
                WHERE user_id = v_user.id
                AND skill_type = 'industry'
                AND skill_name = v_lead.industry
            ) INTO v_skill_match;
            
            IF v_skill_match THEN
                v_match_score := v_match_score + 25;
                v_reasons := array_append(v_reasons, 'Industry match');
            END IF;
        END IF;
        
        -- Check product/expertise match from requirement
        IF v_lead.requirement IS NOT NULL THEN
            -- Try to match requirement keywords with product skills
            SELECT EXISTS(
                SELECT 1 FROM public.user_skills
                WHERE user_id = v_user.id
                AND skill_type IN ('product', 'expertise')
                AND (
                    LOWER(skill_name) = ANY(string_to_array(LOWER(v_lead.requirement), ' '))
                    OR LOWER(v_lead.requirement) LIKE '%' || LOWER(skill_name) || '%'
                )
            ) INTO v_skill_match;
            
            IF v_skill_match THEN
                v_match_score := v_match_score + 20;
                v_reasons := array_append(v_reasons, 'Product/Expertise match');
            END IF;
        END IF;
        
        -- Only return users with some match
        IF v_match_score > 0 THEN
            user_id := v_user.id;
            match_score := v_match_score;
            match_reasons := v_reasons;
            RETURN NEXT;
        END IF;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;
