-- Add languages_known column to users table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'languages_known'
  ) THEN
    ALTER TABLE public.users ADD COLUMN languages_known TEXT[];
  END IF;
END $$;
