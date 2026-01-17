"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export interface TogglePathPublicStatusResult {
  success: boolean
  error?: string
}

/**
 * Toggle the public (is_public) status of a path
 * Only the owner of the path can update its public status
 */
export async function togglePathPublicStatus(
  pathId: string,
  isPublic: boolean
): Promise<TogglePathPublicStatusResult> {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // First verify the path exists and belongs to the user
  const { data: path, error: pathError } = await supabase
    .from("upgrade_paths")
    .select("user_id, slug")
    .eq("id", pathId)
    .single()

  if (pathError || !path) {
    console.error("Failed to fetch path:", pathError)
    return { success: false, error: "Path not found" }
  }

  if (path.user_id !== user.id) {
    return { success: false, error: "You can only update your own paths" }
  }

  // Update the path public status
  const { error: updateError } = await supabase
    .from("upgrade_paths")
    .update({ 
      is_public: isPublic, 
      updated_at: new Date().toISOString() 
    })
    .eq("id", pathId)
    .eq("user_id", user.id) // Double-check ownership

  if (updateError) {
    console.error("Failed to update path public status:", updateError)
    return { success: false, error: "Failed to update path public status" }
  }

  // Revalidate relevant paths
  // Fetch username for revalidation
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle()
  
  // Revalidate path-specific route if slug exists
  if (path.slug && profile?.username) {
    revalidatePath(`/u/${profile.username}/${path.slug}`)
  }
  
  // Revalidate unified route (username or userId fallback)
  const usernameOrId = profile?.username || user.id
  revalidatePath(`/u/${usernameOrId}`)

  return { success: true }
}
