-- Migration: Add primary_pillar to upgrade_paths for AI-assigned Human Moat focus
-- Mapped from n8n json.hvq_analysis.primary_pillar (e.g. 'liability'|'context'|'edgeCase'|'connection')

ALTER TABLE upgrade_paths ADD COLUMN IF NOT EXISTS primary_pillar TEXT;

COMMENT ON COLUMN upgrade_paths.primary_pillar IS 'AI-assigned primary Human Pillar for this path (from hvq_analysis.primary_pillar). Used for 2× Human Moat when human course hvq_primary_pillar matches.';
