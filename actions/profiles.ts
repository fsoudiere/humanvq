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
          console.log(`⏳ Session check failed (attempt ${attempt}/${maxRetries}), retrying...`)
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }
        console.error("❌ Session Check Failed after retries:", sessionError)
        return { success: false, error: "Session not active. Please sign in again." }
      }

      // Step 2: Get authenticated user (this also refreshes the token if needed)
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        if (attempt < maxRetries) {
          console.log(`⏳ User auth failed (attempt ${attempt}/${maxRetries}), retrying...`)
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }
        console.error("❌ User Auth Failed after retries:", userError)
        return { success: false, error: "User not authenticated" }
      }

      // Step 3: Check if profile exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("user_id, username")
        .eq("user_id", user.id)
        .maybeSingle()

      if (fetchError) {
        console.error("❌ Failed to fetch profile:", fetchError)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }
        return { success: false, error: "Failed to check profile existence" }
      }

      // Step 4: If profile exists and has username, return it
      if (existingProfile && existingProfile.username) {
        console.log(`✅ Profile exists with username: ${existingProfile.username}`)
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
          console.log(`⏳ Profile upsert failed (attempt ${attempt}/${maxRetries}), retrying...`, upsertError)
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
          continue
        }

        console.error("❌ Failed to ensure profile with username:", upsertError)
        return { success: false, error: "Failed to create profile. Please try again." }
      }

      if (upsertedProfile) {
        console.log(`✅ Created/updated profile with username: ${upsertedProfile.username}`)
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
      console.error(`❌ Error in ensureProfile (attempt ${attempt}/${maxRetries}):`, error)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
        continue
      }
      return { success: false, error: "An unexpected error occurred while creating profile" }
    }
  }

  return { success: false, error: "Failed to ensure profile after all retries" }
}
