"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export interface TogglePathPrivacyResult {
  success: boolean
  error?: string
}

/**
 * Toggle the privacy (is_public) status of a path
 * Only the owner of the path can update its privacy
 */
export async function togglePathPrivacy(
  pathId: string,
  isPublic: boolean
): Promise<TogglePathPrivacyResult> {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // First verify the path exists and belongs to the user
  const { data: path, error: pathError } = await supabase
    .from("upgrade_paths")
    .select("user_id")
    .eq("id", pathId)
    .single()

  if (pathError || !path) {
    console.error("Failed to fetch path:", pathError)
    return { success: false, error: "Path not found" }
  }

  if (path.user_id !== user.id) {
    return { success: false, error: "You can only update your own paths" }
  }

  // Update the path visibility
  const { error: updateError } = await supabase
    .from("upgrade_paths")
    .update({ 
      is_public: isPublic, 
      updated_at: new Date().toISOString() 
    })
    .eq("id", pathId)
    .eq("user_id", user.id) // Double-check ownership

  if (updateError) {
    console.error("Failed to update path privacy:", updateError)
    return { success: false, error: "Failed to update path privacy" }
  }

  // Revalidate relevant paths
  // Fetch slug and username for revalidation
  const { data: pathWithSlug } = await supabase
    .from("upgrade_paths")
    .select("slug")
    .eq("id", pathId)
    .single()
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle()
  
  if (pathWithSlug?.slug && profile?.username) {
    revalidatePath(`/u/${profile.username}/${pathWithSlug.slug}`)
  }
  revalidatePath(`/stack/${user.id}`)

  return { success: true }
}
