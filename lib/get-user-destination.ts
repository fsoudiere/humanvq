import { createClient } from "@/utils/supabase/server"

/**
 * Determines the appropriate redirect destination for a logged-in user
 * based on their profile and path status.
 * 
 * Priority:
 * - Scenario A (The Pro): Has username → /u/[username]
 * - Scenario B (The Newbie): No username but has paths → /u/[userId]
 * - Scenario C (The Blank Slate): No username and no paths → /settings (to set username first)
 * 
 * @param userId - The authenticated user's ID
 * @returns The destination path string
 */
export async function getUserDestination(userId: string): Promise<string> {
  const supabase = await createClient()
  
  // Fetch profile by user_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", userId)
    .maybeSingle()
  
  // Scenario A: User has username → redirect to /u/[username]
  if (profile?.username) {
    return `/u/${profile.username}`
  }
  
  // Check if user has any paths
  const { data: paths } = await supabase
    .from("upgrade_paths")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
  
  const hasPaths = paths && paths.length > 0
  
  // Scenario B: No username but has paths → redirect to /u/[userId]
  if (hasPaths) {
    return `/u/${userId}`
  }
  
  // Scenario C: No username and no paths → redirect to /settings to set username first
  return `/settings`
}
