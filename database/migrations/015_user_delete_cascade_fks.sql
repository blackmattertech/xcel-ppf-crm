-- Migration: Add ON DELETE behavior to foreign keys referencing users
-- This allows user deletion without manual clearing of references.
-- Nullable columns: SET NULL. NOT NULL columns: handled by app or CASCADE.

-- 1. leads.assigned_to (nullable) -> ON DELETE SET NULL
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. roles.created_by (nullable) -> ON DELETE SET NULL
ALTER TABLE public.roles
  DROP CONSTRAINT IF EXISTS roles_created_by_fkey;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. quotations.rejected_by (nullable, if column exists) -> ON DELETE SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotations' AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_rejected_by_fkey;
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_rejected_by_fkey
      FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. facebook_business_settings.created_by (nullable, if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'facebook_business_settings') THEN
    ALTER TABLE public.facebook_business_settings DROP CONSTRAINT IF EXISTS facebook_business_settings_created_by_fkey;
    ALTER TABLE public.facebook_business_settings
      ADD CONSTRAINT facebook_business_settings_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. products.created_by (nullable, if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_created_by_fkey;
    ALTER TABLE public.products
      ADD CONSTRAINT products_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. lead_activities.performed_by (if table exists)
-- SET NULL requires nullable column; alter to nullable first if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_activities') THEN
    ALTER TABLE public.lead_activities DROP CONSTRAINT IF EXISTS lead_activities_performed_by_fkey;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_activities' AND column_name = 'performed_by'
        AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE public.lead_activities ALTER COLUMN performed_by DROP NOT NULL;
    END IF;
    ALTER TABLE public.lead_activities
      ADD CONSTRAINT lead_activities_performed_by_fkey
      FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
