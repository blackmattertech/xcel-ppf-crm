-- Lead notes table to store user-entered notes related to leads.
CREATE TABLE IF NOT EXISTS public.lead_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_id_idx ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS lead_notes_created_at_idx ON public.lead_notes(created_at DESC);

CREATE TRIGGER update_lead_notes_updated_at BEFORE UPDATE ON public.lead_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
