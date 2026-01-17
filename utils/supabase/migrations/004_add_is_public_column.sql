-- Migration: Add is_public column to upgrade_paths table
-- This allows paths to be shared publicly via /u/[username]/[pathId]

-- Add is_public column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'upgrade_paths' 
    AND column_name = 'is_public'
  ) THEN
    ALTER TABLE upgrade_paths 
    ADD COLUMN is_public BOOLEAN DEFAULT false NOT NULL;
    
    -- Create index for faster queries on public paths
    CREATE INDEX IF NOT EXISTS idx_upgrade_paths_is_public 
    ON upgrade_paths(is_public) 
    WHERE is_public = true;
  END IF;
END $$;

-- Update RLS policies to allow public access to public paths
-- First, drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public paths are viewable by everyone" ON upgrade_paths;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Allow anyone to view profiles (for username lookups)
CREATE POLICY "Users can view all profiles"
ON profiles FOR SELECT
USING (true);

-- Allow anyone to view public upgrade paths
CREATE POLICY "Public paths are viewable by everyone"
ON upgrade_paths FOR SELECT
USING (is_public = true);

-- Ensure authenticated users can still manage their own paths
DROP POLICY IF EXISTS "Users can update their own paths" ON upgrade_paths;
CREATE POLICY "Users can update their own paths"
ON upgrade_paths FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
