-- Create follow_ups table
CREATE TABLE IF NOT EXISTS public.follow_ups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES public.users(id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rescheduled', 'no_response')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for follow_ups
CREATE INDEX IF NOT EXISTS follow_ups_lead_id_idx ON public.follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS follow_ups_assigned_to_idx ON public.follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS follow_ups_scheduled_at_idx ON public.follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS follow_ups_status_idx ON public.follow_ups(status);
CREATE INDEX IF NOT EXISTS follow_ups_pending_idx ON public.follow_ups(scheduled_at, status) WHERE status = 'pending';

-- Create quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    quote_number TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    items JSONB NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,
    gst DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    validity_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'accepted', 'expired')),
    pdf_url TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for quotations
CREATE INDEX IF NOT EXISTS quotations_lead_id_idx ON public.quotations(lead_id);
CREATE INDEX IF NOT EXISTS quotations_quote_number_idx ON public.quotations(quote_number);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON public.quotations(status);
CREATE INDEX IF NOT EXISTS quotations_created_by_idx ON public.quotations(created_by);
CREATE INDEX IF NOT EXISTS quotations_validity_date_idx ON public.quotations(validity_date);

-- Create trigger for updated_at on follow_ups
CREATE TRIGGER update_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for updated_at on quotations
CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON public.quotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
