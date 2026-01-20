"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { generatePath } from "./generate-path"

export interface ClonePathResult {
  success: boolean
  error?: string
  pathId?: string
}

export async function clonePath(pathId: string): Promise<ClonePathResult> {
  try {
    const supabase = await createClient()

    // 1. Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "User not authenticated" }
    }

    // 2. Fetch the original path data
    const { data: originalPath, error: fetchError } = await supabase
      .from("upgrade_paths")
      .select("role, main_goal, context")
      .eq("id", pathId)
      .eq("user_id", user.id) // Ensure user owns the path
      .single()

    if (fetchError || !originalPath) {
      return { success: false, error: "Path not found or access denied" }
    }

    // 3. Use generatePath to create a new path with the same data
    // This will trigger the webhook and regenerate the path
    const result = await generatePath({
      currentRole: originalPath.role || "",
      mainGoal: originalPath.main_goal || "",
      bioContext: originalPath.context || "",
    })

    if (!result.success) {
      return { success: false, error: result.error || "Failed to clone path" }
    }

    // 4. Revalidate the dashboard
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profile?.username) {
      revalidatePath(`/u/${profile.username}`)
    }

    return { success: true, pathId: result.pathId }
  } catch (error) {
    console.error("Error cloning path:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}
