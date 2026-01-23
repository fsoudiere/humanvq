"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export async function deletePath(pathId: string) {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // Delete the path (only if user owns it)
  const { error: deleteError } = await supabase
    .from("upgrade_paths")
    .delete()
    .eq("id", pathId)
    .eq("user_id", user.id) // Ensure user can only delete their own paths

  if (deleteError) {
    return { success: false, error: "Failed to delete path" }
  }

  revalidatePath("/stack")
  return { success: true }
}
