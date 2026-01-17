# Supabase Migrations

This folder contains SQL migration files for the HumanVQ database schema.

## Migration Order

Migrations should be run in numerical order:

1. **001_trigger_auto_create_profile.sql** - Creates trigger to auto-create profiles on user signup
2. **002_path_resources_table.sql** - Creates `path_resources` table for path-specific tool management
3. **003_add_slug_column.sql** - Adds `slug` column to `upgrade_paths` table for slug-based routing
4. **004_add_is_public_column.sql** - Adds `is_public` column to `upgrade_paths` table and updates RLS policies

## How to Apply Migrations

1. Open Supabase Dashboard → SQL Editor
2. Run each migration file in order (001 → 002 → 003 → 004)
3. Verify each migration completes successfully before running the next

## Notes

- All migrations use `IF NOT EXISTS` checks to be idempotent (safe to run multiple times)
- The trigger migration (001) should be run first as it sets up the profile creation flow
- RLS policies are updated in migration 004 to allow public path access
