-- Migration: Create path_resources table for path-specific tool management
-- This table tracks which tools are added/removed from specific paths

-- Create path_resources table if it doesn't exist
CREATE TABLE IF NOT EXISTS path_resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  path_id UUID NOT NULL REFERENCES upgrade_paths(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('suggested', 'added_free', 'added_paid', 'added_enrolled', 'added_completed', 'wishlisted', 'removed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(path_id, resource_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_path_resources_path_id ON path_resources(path_id);
CREATE INDEX IF NOT EXISTS idx_path_resources_resource_id ON path_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_path_resources_status ON path_resources(status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_path_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_path_resources_updated_at
  BEFORE UPDATE ON path_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_path_resources_updated_at();

-- RLS Policies
ALTER TABLE path_resources ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view path_resources for paths they own or public paths
CREATE POLICY "Users can view path_resources for their paths"
ON path_resources FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM upgrade_paths
    WHERE upgrade_paths.id = path_resources.path_id
    AND (
      upgrade_paths.user_id = auth.uid()
      OR upgrade_paths.is_public = true
    )
  )
);

-- Policy: Users can manage path_resources for their own paths only
CREATE POLICY "Users can manage their own path_resources"
ON path_resources FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM upgrade_paths
    WHERE upgrade_paths.id = path_resources.path_id
    AND upgrade_paths.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM upgrade_paths
    WHERE upgrade_paths.id = path_resources.path_id
    AND upgrade_paths.user_id = auth.uid()
  )
);
