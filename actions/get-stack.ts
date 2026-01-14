"use server"

import { createClient } from "@/utils/supabase/server"

export async function getUserStack(targetUserId: string) {
  const supabase = await createClient()

  // Fetch stack items joined with resource details
  const { data: stackItems, error } = await supabase
    .from("user_stacks")
    .select(`
      status,
      resource:resources (
        id,
        name,
        description,
        url,
        capabilities,
        difficulty_level,
        hvq_primary_pillar,
        type
      )
    `)
    .eq("user_id", targetUserId)

  if (error) {
    console.error("Error fetching stack:", error)
    return null
  }

  // Fetch User Profile (for the page title)
  const { data: profile } = await supabase
    .from("profiles") // Ensure this table exists (or change to 'users' table if you use that)
    .select("current_role, main_goal")
    .eq("user_id", targetUserId)
    .single()

  return { stack: stackItems, profile }
}