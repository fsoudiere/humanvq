-- Migration: Add Human Pillars to upgrade_paths for calculateVulnerability
-- The AI audit (n8n) should set these when creating a path. Each 0.0–1.0.
-- Used by: calculateVulnerability(focus_area, pillars) and Replacement Risk UI.

ALTER TABLE upgrade_paths ADD COLUMN IF NOT EXISTS pillar_liability REAL;
ALTER TABLE upgrade_paths ADD COLUMN IF NOT EXISTS pillar_context REAL;
ALTER TABLE upgrade_paths ADD COLUMN IF NOT EXISTS pillar_edge_case REAL;
ALTER TABLE upgrade_paths ADD COLUMN IF NOT EXISTS pillar_connection REAL;

COMMENT ON COLUMN upgrade_paths.pillar_liability IS 'Human Pillar score 0–1 from AI audit. Higher = more human-centric.';
COMMENT ON COLUMN upgrade_paths.pillar_context IS 'Human Pillar score 0–1 from AI audit.';
COMMENT ON COLUMN upgrade_paths.pillar_edge_case IS 'Human Pillar score 0–1 from AI audit.';
COMMENT ON COLUMN upgrade_paths.pillar_connection IS 'Human Pillar score 0–1 from AI audit.';
