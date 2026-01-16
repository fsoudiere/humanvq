"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export async function togglePathVisibility(pathId: string, isPublic: boolean) {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // Update the path visibility (only if user owns it)
  const { error: updateError } = await supabase
    .from("upgrade_paths")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq("id", pathId)
    .eq("user_id", user.id) // Ensure user can only update their own paths

  if (updateError) {
    console.error("Failed to update path visibility:", updateError)
    return { success: false, error: "Failed to update path visibility" }
  }

  revalidatePath("/stack")
  return { success: true }
}
