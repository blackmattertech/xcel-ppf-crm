-- Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    source TEXT NOT NULL CHECK (source IN ('meta', 'manual', 'form', 'whatsapp', 'ivr')),
    campaign_id TEXT,
    ad_id TEXT,
    adset_id TEXT,
    form_id TEXT,
    form_name TEXT,
    ad_name TEXT,
    campaign_name TEXT,
    meta_data JSONB,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'unqualified', 'quotation_shared', 'interested', 'negotiation', 'lost', 'converted')),
    interest_level TEXT CHECK (interest_level IN ('hot', 'warm', 'cold')),
    budget_range TEXT,
    requirement TEXT,
    timeline TEXT,
    assigned_to UUID REFERENCES public.users(id),
    branch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    first_contact_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ
);

-- Create unique index on phone
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_unique ON public.leads(phone) WHERE phone IS NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_source_idx ON public.leads(source);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at);

-- Create lead_status_history table
CREATE TABLE IF NOT EXISTS public.lead_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES public.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for lead_status_history
CREATE INDEX IF NOT EXISTS lead_status_history_lead_id_idx ON public.lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS lead_status_history_created_at_idx ON public.lead_status_history(created_at);

-- Create calls table
CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    called_by UUID NOT NULL REFERENCES public.users(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('connected', 'not_reachable', 'wrong_number', 'call_later')),
    disposition TEXT,
    notes TEXT,
    call_duration INTEGER, -- in seconds
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for calls
CREATE INDEX IF NOT EXISTS calls_lead_id_idx ON public.calls(lead_id);
CREATE INDEX IF NOT EXISTS calls_called_by_idx ON public.calls(called_by);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON public.calls(created_at);

-- Create assignments table for round-robin
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    lead_source TEXT NOT NULL CHECK (lead_source IN ('meta', 'manual', 'form')),
    last_assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assignment_count INTEGER DEFAULT 0,
    UNIQUE(user_id, lead_source)
);

-- Create indexes for assignments
CREATE INDEX IF NOT EXISTS assignments_user_id_idx ON public.assignments(user_id);
CREATE INDEX IF NOT EXISTS assignments_lead_source_idx ON public.assignments(lead_source);
CREATE INDEX IF NOT EXISTS assignments_last_assigned_at_idx ON public.assignments(lead_source, last_assigned_at);

-- Create trigger for updated_at on leads
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
