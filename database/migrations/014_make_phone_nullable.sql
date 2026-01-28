-- Make phone column nullable in leads table
-- This allows importing leads without phone numbers (e.g., when only email is provided)

ALTER TABLE public.leads 
ALTER COLUMN phone DROP NOT NULL;

-- Comment to explain the change
COMMENT ON COLUMN public.leads.phone IS 'Phone number (optional) - at least one contact method (phone or email) is recommended';
