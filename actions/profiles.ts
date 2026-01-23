"use server"

import { createClient } from "@/utils/supabase/server"
import { generateDefaultUsername } from "@/lib/generate-username"

export interface EnsureProfileResult {
  success: boolean
  error?: string
  profile?: {
    user_id: string
    username: string
  }
}

/**
 * Ensure a profile exists for the current user with a username.
 * This function includes retry logic to handle auth token refresh delays.
 * 
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @param retryDelayMs Delay between retries in milliseconds (default: 500)
 * @returns Profile data or error
 */
export async function ensureProfile(
  maxRetries: number = 3,
  retryDelayMs: number = 500
): Promise<EnsureProfileResult> {
  const supabase = await createClient()

  // Retry loop to handle auth token refresh delays
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Step 1: Verify session is active
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }
        return { success: false, error: "Session not active. Please sign in again." }
      }

      // Step 2: Get authenticated user (this also refreshes the token if needed)
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }
        return { success: false, error: "User not authenticated" }
      }

      // Step 3: Check if profile exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("user_id, username")
        .eq("user_id", user.id)
        .maybeSingle()

      if (fetchError) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }
        return { success: false, error: "Failed to check profile existence" }
      }

      // Step 4: If profile exists and has username, return it
      if (existingProfile && existingProfile.username) {
        return {
          success: true,
          profile: {
            user_id: existingProfile.user_id,
            username: existingProfile.username
          }
        }
      }

      // Step 5: Create or update profile with default username
      const defaultUsername = generateDefaultUsername(user.id)
      
      // Small delay to ensure auth is fully propagated
      await new Promise(resolve => setTimeout(resolve, 100))

      const { data: upsertedProfile, error: upsertError } = await supabase
        .from("profiles")
        .upsert({
          user_id: user.id,
          username: defaultUsername,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id"
        })
        .select("user_id, username")
        .single()

      if (upsertError) {
        // Check if it's a unique constraint violation (username conflict)
        if (upsertError.code === "23505" || upsertError.message?.toLowerCase().includes("unique")) {
          // Username conflict - try fetching again
          const { data: conflictProfile } = await supabase
            .from("profiles")
            .select("user_id, username")
            .eq("user_id", user.id)
            .maybeSingle()
          
          if (conflictProfile && conflictProfile.username) {
            return {
              success: true,
              profile: {
                user_id: conflictProfile.user_id,
                username: conflictProfile.username
              }
            }
          }
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }

        return { success: false, error: "Failed to create profile. Please try again." }
      }

      if (upsertedProfile) {
        return {
          success: true,
          profile: {
            user_id: upsertedProfile.user_id,
            username: upsertedProfile.username
          }
        }
      }

      // If we get here, something unexpected happened
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
        continue
      }

      return { success: false, error: "Failed to create profile" }

    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
        continue
      }
      return { success: false, error: "An unexpected error occurred while creating profile" }
    }
  }

  return { success: false, error: "Failed to ensure profile after all retries" }
}

/**
 * Server action to determine the appropriate redirect destination for a logged-in user.
 * Can be called from both server and client components.
 * 
 * Priority:
 * - Scenario A (The Pro): Has username → /u/[username]
 * - Scenario B (The Newbie): No username but has paths → /u/[userId]
 * - Scenario C (The Blank Slate): No username and no paths → /u/[userId]/create
 * 
 * @param userId - Optional user ID. If not provided, gets the authenticated user internally.
 * @returns The destination path string, or null if user is not authenticated
 */
export async function getUserDestination(userId?: string): Promise<string | null> {
  const supabase = await createClient()
  
  let finalUserId: string | null = null
  
  if (userId) {
    // Server component usage: userId provided
    finalUserId = userId
  } else {
    // Client component usage: get user internally
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return null
    }
    finalUserId = user.id
  }
  
  if (!finalUserId) {
    return null
  }
  
  // Fetch profile by user_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", finalUserId)
    .maybeSingle()
  
  // Scenario A: User has username → redirect to /u/[username]
  if (profile?.username) {
    return `/u/${profile.username}`
  }
  
  // Check if user has any paths
  const { data: paths } = await supabase
    .from("upgrade_paths")
    .select("id")
    .eq("user_id", finalUserId)
    .limit(1)
  
  const hasPaths = paths && paths.length > 0
  
  // Scenario B: No username but has paths → redirect to /u/[userId]
  if (hasPaths) {
    return `/u/${finalUserId}`
  }
  
  // Scenario C: No username and no paths → redirect to /u/[userId]/create
  return `/u/${finalUserId}/create`
}