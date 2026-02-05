-- Migration to add Lead Journey statuses: contacted and discarded
-- This migration updates the leads table to support the complete Lead Journey flow

-- Drop the existing check constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new check constraint with all lifecycle statuses including contacted and discarded
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
  CHECK (status IN (
    'new', 
    'contacted',        -- NEW: After first call attempt
    'qualified', 
    'unqualified', 
    'quotation_shared',
    'quotation_viewed',
    'quotation_accepted',
    'quotation_expired',
    'interested', 
    'negotiation', 
    'lost',             -- Used for discarded leads
    'discarded',        -- NEW: Explicit discarded status (maps to lost in some contexts)
    'converted',
    'deal_won',
    'payment_pending',
    'advance_received',
    'fully_paid'
  ));

-- Add quotation rejection reason field to quotations table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN rejection_reason TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'rejected_at'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN rejected_by UUID REFERENCES public.users(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'admin_notified'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN admin_notified BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Create index on rejection fields for admin notifications
CREATE INDEX IF NOT EXISTS quotations_rejection_idx ON public.quotations(rejected_at, admin_notified) 
  WHERE rejection_reason IS NOT NULL;

-- Add comment explaining the Lead Journey flow
COMMENT ON COLUMN public.leads.status IS 'Lead Journey Status: new -> contacted -> qualified -> negotiation -> deal_won | lost/discarded';
