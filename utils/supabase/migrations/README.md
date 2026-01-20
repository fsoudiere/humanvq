# Supabase Migrations

This folder contains SQL migration files for the HumanVQ database schema.

## Migration Order

Migrations should be run in numerical order:

1. **001_trigger_auto_create_profile.sql** - Creates trigger to auto-create profiles on user signup
2. **002_path_resources_table.sql** - Creates `path_resources` table for path-specific tool management
3. **003_add_slug_column.sql** - Adds `slug` column to `upgrade_paths` table for slug-based routing
4. **004_add_is_public_column.sql** - Adds `is_public` column to `upgrade_paths` table and updates RLS policies
5. **005_add_hvq_primary_pillar_to_resources.sql** - Adds `hvq_primary_pillar` to `resources` for 2× Human Moat
6. **006_add_human_pillars_to_upgrade_paths.sql** - Adds `pillar_liability`, `pillar_context`, `pillar_edge_case`, `pillar_connection` to `upgrade_paths` for `calculateVulnerability` (n8n hvq_analysis.pillars)
7. **007_add_primary_pillar_to_upgrade_paths.sql** - Adds `primary_pillar` to `upgrade_paths` (from n8n hvq_analysis.primary_pillar)

## How to Apply Migrations

1. Open Supabase Dashboard → SQL Editor
2. Run each migration file in order (001 → 007)
3. Verify each migration completes successfully before running the next

## Notes

- All migrations use `IF NOT EXISTS` checks to be idempotent (safe to run multiple times)
- The trigger migration (001) should be run first as it sets up the profile creation flow
- RLS policies are updated in migration 004 to allow public path access
