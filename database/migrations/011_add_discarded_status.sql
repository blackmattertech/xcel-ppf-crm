-- Migration to add 'discarded' status for leads with wrong numbers
-- This allows leads to be marked as discarded when wrong number is detected

-- Drop the existing check constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new check constraint with discarded status
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
  CHECK (status IN (
    'new', 
    'qualified', 
    'unqualified', 
    'quotation_shared',
    'quotation_viewed',
    'quotation_accepted',
    'quotation_expired',
    'interested', 
    'negotiation', 
    'lost',
    'discarded',
    'converted',
    'deal_won',
    'payment_pending',
    'advance_received',
    'fully_paid'
  ));
