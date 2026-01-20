-- Migration: Add hvq_primary_pillar to resources for Human Moat 2× scoring
-- When a human course's hvq_primary_pillar matches the user's primaryPillar (from GOAL_PILLAR_MAP[role]),
-- its contribution to the Human Floor is doubled.
-- Valid values: 'liability' | 'context' | 'edgeCase' | 'connection'

ALTER TABLE resources ADD COLUMN IF NOT EXISTS hvq_primary_pillar TEXT;

COMMENT ON COLUMN resources.hvq_primary_pillar IS 'Human Pillar this resource strengthens: liability, context, edgeCase, or connection. Used for 2× Human Moat bonus when it matches the user primaryPillar.';
