-- Migration to add lead nurturing and automation system
-- This migration adds drip campaigns, trigger-based actions, and campaign enrollments

-- Create nurture_campaigns table
CREATE TABLE IF NOT EXISTS public.nurture_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    campaign_type TEXT NOT NULL CHECK (campaign_type IN ('drip', 'trigger', 're_engagement')),
    trigger_condition JSONB, -- Conditions that trigger the campaign
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create nurture_steps table for campaign steps
CREATE TABLE IF NOT EXISTS public.nurture_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.nurture_campaigns(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_type TEXT NOT NULL CHECK (step_type IN ('email', 'sms', 'whatsapp', 'delay', 'action')),
    delay_hours INTEGER DEFAULT 0, -- Hours to wait before this step
    content JSONB, -- Step content (subject, body, etc.)
    action_type TEXT, -- For action steps: 'create_followup', 'update_status', etc.
    action_data JSONB, -- Action parameters
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create nurture_enrollments table
CREATE TABLE IF NOT EXISTS public.nurture_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.nurture_campaigns(id) ON DELETE CASCADE,
    current_step_id UUID REFERENCES public.nurture_steps(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_step_executed_at TIMESTAMPTZ,
    next_step_scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create nurture_step_executions table to track step execution
CREATE TABLE IF NOT EXISTS public.nurture_step_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enrollment_id UUID NOT NULL REFERENCES public.nurture_enrollments(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES public.nurture_steps(id) ON DELETE CASCADE,
    execution_status TEXT NOT NULL CHECK (execution_status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
    executed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB, -- Additional execution data
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS nurture_campaigns_type_idx ON public.nurture_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS nurture_campaigns_active_idx ON public.nurture_campaigns(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS nurture_steps_campaign_id_idx ON public.nurture_steps(campaign_id);
CREATE INDEX IF NOT EXISTS nurture_steps_order_idx ON public.nurture_steps(campaign_id, step_order);

CREATE INDEX IF NOT EXISTS nurture_enrollments_lead_id_idx ON public.nurture_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS nurture_enrollments_campaign_id_idx ON public.nurture_enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS nurture_enrollments_status_idx ON public.nurture_enrollments(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS nurture_enrollments_next_step_idx ON public.nurture_enrollments(next_step_scheduled_at) WHERE status = 'active' AND next_step_scheduled_at IS NOT NULL;

-- Create partial unique index to prevent duplicate active enrollments
CREATE UNIQUE INDEX IF NOT EXISTS nurture_enrollments_unique_active 
    ON public.nurture_enrollments(lead_id, campaign_id) 
    WHERE status = 'active';

-- Create partial unique index to prevent duplicate active enrollments
CREATE UNIQUE INDEX IF NOT EXISTS nurture_enrollments_unique_active 
    ON public.nurture_enrollments(lead_id, campaign_id) 
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS nurture_step_executions_enrollment_id_idx ON public.nurture_step_executions(enrollment_id);
CREATE INDEX IF NOT EXISTS nurture_step_executions_step_id_idx ON public.nurture_step_executions(step_id);
CREATE INDEX IF NOT EXISTS nurture_step_executions_status_idx ON public.nurture_step_executions(execution_status);

-- Create triggers
CREATE TRIGGER update_nurture_campaigns_updated_at BEFORE UPDATE ON public.nurture_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nurture_steps_updated_at BEFORE UPDATE ON public.nurture_steps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nurture_enrollments_updated_at BEFORE UPDATE ON public.nurture_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to process pending nurture steps
CREATE OR REPLACE FUNCTION process_pending_nurture_steps()
RETURNS INTEGER AS $$
DECLARE
    v_enrollment RECORD;
    v_step RECORD;
    v_processed_count INTEGER := 0;
BEGIN
    -- Get enrollments with steps ready to execute
    FOR v_enrollment IN
        SELECT e.*, c.campaign_type
        FROM public.nurture_enrollments e
        JOIN public.nurture_campaigns c ON e.campaign_id = c.id
        WHERE e.status = 'active'
        AND e.next_step_scheduled_at IS NOT NULL
        AND e.next_step_scheduled_at <= NOW()
        AND c.is_active = true
        ORDER BY e.next_step_scheduled_at ASC
        LIMIT 100
    LOOP
        -- Get the current step
        SELECT * INTO v_step
        FROM public.nurture_steps
        WHERE campaign_id = v_enrollment.campaign_id
        AND step_order = (
            SELECT COALESCE(MAX(step_order), 0) + 1
            FROM public.nurture_step_executions
            WHERE enrollment_id = v_enrollment.id
            AND execution_status IN ('sent', 'delivered', 'skipped')
        )
        AND is_active = true
        ORDER BY step_order ASC
        LIMIT 1;
        
        IF FOUND THEN
            -- Mark step as pending execution (actual execution will be done by application)
            INSERT INTO public.nurture_step_executions (
                enrollment_id,
                step_id,
                execution_status,
                executed_at
            ) VALUES (
                v_enrollment.id,
                v_step.id,
                'pending',
                NOW()
            );
            
            -- Calculate next step schedule time
            DECLARE
                v_next_scheduled TIMESTAMPTZ;
            BEGIN
                v_next_scheduled := NOW() + (v_step.delay_hours || 0 || INTERVAL '0 hours');
                
                UPDATE public.nurture_enrollments
                SET current_step_id = v_step.id,
                    last_step_executed_at = NOW(),
                    next_step_scheduled_at = CASE
                        WHEN EXISTS (
                            SELECT 1 FROM public.nurture_steps
                            WHERE campaign_id = v_enrollment.campaign_id
                            AND step_order > v_step.step_order
                            AND is_active = true
                        ) THEN v_next_scheduled
                        ELSE NULL -- Campaign completed
                    END,
                    status = CASE
                        WHEN EXISTS (
                            SELECT 1 FROM public.nurture_steps
                            WHERE campaign_id = v_enrollment.campaign_id
                            AND step_order > v_step.step_order
                            AND is_active = true
                        ) THEN 'active'
                        ELSE 'completed'
                    END,
                    completed_at = CASE
                        WHEN NOT EXISTS (
                            SELECT 1 FROM public.nurture_steps
                            WHERE campaign_id = v_enrollment.campaign_id
                            AND step_order > v_step.step_order
                            AND is_active = true
                        ) THEN NOW()
                        ELSE NULL
                    END,
                    updated_at = NOW()
                WHERE id = v_enrollment.id;
            END;
            
            v_processed_count := v_processed_count + 1;
        ELSE
            -- No more steps, mark as completed
            UPDATE public.nurture_enrollments
            SET status = 'completed',
                completed_at = NOW(),
                next_step_scheduled_at = NULL,
                updated_at = NOW()
            WHERE id = v_enrollment.id;
        END IF;
    END LOOP;
    
    RETURN v_processed_count;
END;
$$ LANGUAGE plpgsql;
