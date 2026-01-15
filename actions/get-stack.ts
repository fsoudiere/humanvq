"use server"

import { createClient } from "@/utils/supabase/server"

export async function getUserStack(targetUserId: string) {
  const supabase = await createClient()

  // 1. Fetch Stack (Tools/Courses)
  const { data: stackItems, error: stackError } = await supabase
    .from("user_stacks")
    .select(`
      status,
      resource:resources (
        id, name, description, url, logo_url, capabilities, type
      )
    `)
    .eq("user_id", targetUserId)

  // 2. Fetch ALL Upgrade Paths (The Projects) - NEW STEP
  const { data: paths, error: pathError } = await supabase
    .from("upgrade_paths")
    .select("*")
    .eq("user_id", targetUserId)
    .order('created_at', { ascending: false })

  if (stackError) {
    console.error("Error fetching stack:", stackError)
    return null
  }

  // 3. Fetch Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_role, main_goal")
    .eq("user_id", targetUserId)
    .single()

  return { 
    stack: stackItems || [], 
    profile,
    paths: paths || [] // Returning paths now
  }
}