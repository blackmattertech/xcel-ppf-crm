-- Migration to add new lead lifecycle statuses
-- This migration updates the leads table to support the comprehensive lead lifecycle

-- First, drop the existing check constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new check constraint with all lifecycle statuses
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
    'converted',
    'deal_won',
    'payment_pending',
    'advance_received',
    'fully_paid'
  ));

-- Add payment tracking fields if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN payment_status TEXT CHECK (payment_status IN ('pending', 'advance_received', 'fully_paid'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'payment_amount'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN payment_amount DECIMAL(10, 2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'advance_amount'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN advance_amount DECIMAL(10, 2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'lost_reason'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN lost_reason TEXT;
  END IF;
END $$;

-- Create index on payment_status if it doesn't exist
CREATE INDEX IF NOT EXISTS leads_payment_status_idx ON public.leads(payment_status);
