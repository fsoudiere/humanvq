"use server"

import { createClient } from "@/utils/supabase/server"

/**
 * Server action to determine the appropriate redirect destination for a logged-in user.
 * Can be called from both server and client components.
 * 
 * Priority:
 * - Scenario A (The Pro): Has username → /u/[username]
 * - Scenario B (The Newbie): No username but has paths → /u/[userId]
 * - Scenario C (The Blank Slate): No username and no paths → /settings (to set username first)
 * 
 * @returns The destination path string, or null if user is not authenticated
 */
export async function getUserDestination(): Promise<string | null> {
  const supabase = await createClient()
  
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return null
  }
  
  // Fetch profile by user_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle()
  
  // Scenario A: User has username → redirect to /u/[username]
  if (profile?.username) {
    return `/u/${profile.username}`
  }
  
  // Check if user has any paths
  const { data: paths } = await supabase
    .from("upgrade_paths")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
  
  const hasPaths = paths && paths.length > 0
  
  // Scenario B: No username but has paths → redirect to /u/[userId]
  if (hasPaths) {
    return `/u/${user.id}`
  }
  
  // Scenario C: No username and no paths → redirect to /settings to set username first
  return `/settings`
}
