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
DECLARE
  default_username TEXT;
BEGIN
  -- Generate default username: "user-" + first 8 characters of user ID (without hyphens)
  default_username := 'user-' || SUBSTRING(REPLACE(new.id::TEXT, '-', ''), 1, 8);
  
  INSERT INTO public.profiles (
    user_id, 
    full_name, 
    avatar_url,
    username,
    created_at,
    updated_at
  )
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    default_username,
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
-- run this to backfill their profiles with default usernames:
--
-- INSERT INTO public.profiles (user_id, username, created_at, updated_at)
-- SELECT 
--   id,
--   'user-' || SUBSTRING(REPLACE(id::TEXT, '-', ''), 1, 8),
--   created_at,
--   NOW()
-- FROM auth.users
-- WHERE id NOT IN (SELECT user_id FROM public.profiles);
--
-- ============================================
-- BONUS: Update existing profiles missing username
-- ============================================
-- If you have existing profiles without usernames, run this:
--
-- UPDATE public.profiles
-- SET username = 'user-' || SUBSTRING(REPLACE(user_id::TEXT, '-', ''), 1, 8)
-- WHERE username IS NULL;
--
-- ============================================
