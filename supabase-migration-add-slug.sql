-- Migration: Add slug column to upgrade_paths table
-- This enables slug-based routing for public paths

-- Add slug column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'upgrade_paths' 
    AND column_name = 'slug'
  ) THEN
    ALTER TABLE upgrade_paths 
    ADD COLUMN slug TEXT;
    
    -- Create index for faster lookups by slug
    CREATE INDEX IF NOT EXISTS idx_upgrade_paths_slug 
    ON upgrade_paths(user_id, slug) 
    WHERE slug IS NOT NULL;
    
    -- Create unique constraint: slug must be unique per user
    -- This allows the same slug for different users, but prevents duplicates for the same user
    CREATE UNIQUE INDEX IF NOT EXISTS idx_upgrade_paths_user_slug_unique 
    ON upgrade_paths(user_id, slug) 
    WHERE slug IS NOT NULL;
  END IF;
END $$;
