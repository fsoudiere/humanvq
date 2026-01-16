-- ============================================
-- SQL TRIGGER: Auto-create Profile on Signup
-- ============================================
-- This trigger automatically creates a profile row in public.profiles
-- whenever a new user signs up via Supabase Auth.
--
-- Instructions:
-- 1. Open Supabase Dashboard -> SQL Editor
-- 2. Paste this entire file
-- 3. Click "Run"
-- 4. For existing users, manually create their profiles or run:
--    INSERT INTO public.profiles (user_id) 
--    SELECT id FROM auth.users 
--    WHERE id NOT IN (SELECT user_id FROM public.profiles);
-- ============================================

-- Function that creates a profile when a new user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id, 
    full_name, 
    avatar_url,
    created_at,
    updated_at
  )
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists (to avoid conflicts)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger that runs the function on user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- BONUS: Create profiles for existing users
-- ============================================
-- If you already have users in auth.users but no profiles,
-- run this to backfill their profiles:
--
-- INSERT INTO public.profiles (user_id, created_at, updated_at)
-- SELECT 
--   id,
--   created_at,
--   NOW()
-- FROM auth.users
-- WHERE id NOT IN (SELECT user_id FROM public.profiles);
--
-- ============================================
