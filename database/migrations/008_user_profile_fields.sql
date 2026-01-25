-- Migration to add user profile fields
-- This migration adds profile_image_url, address, dob (date of birth), and doj (date of joining) to users table

-- Add profile_image_url column (stores the path/URL to the image in Supabase storage)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE public.users ADD COLUMN profile_image_url TEXT;
  END IF;
END $$;

-- Add address column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'address'
  ) THEN
    ALTER TABLE public.users ADD COLUMN address TEXT;
  END IF;
END $$;

-- Add dob (date of birth) column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'dob'
  ) THEN
    ALTER TABLE public.users ADD COLUMN dob DATE;
  END IF;
END $$;

-- Add doj (date of joining) column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'doj'
  ) THEN
    ALTER TABLE public.users ADD COLUMN doj DATE;
  END IF;
END $$;

-- Create index on profile_image_url for faster lookups
CREATE INDEX IF NOT EXISTS users_profile_image_url_idx ON public.users(profile_image_url) WHERE profile_image_url IS NOT NULL;
