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

  // 3. Fetch Profile (using maybeSingle to handle missing profiles gracefully)
  // Only select columns that exist in the profiles table
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, username, is_organization, organization_name, user_id")
    .eq("user_id", targetUserId)
    .maybeSingle()

  // Debug: Log profile data to verify it's being fetched correctly
  if (profile) {
    console.log("🔍 getUserStack - Profile fetched:", {
      userId: targetUserId,
      is_organization: profile.is_organization,
      organization_name: profile.organization_name,
      full_name: profile.full_name,
      allFields: profile
    })
  } else {
    console.log("🔍 getUserStack - No profile found:", {
      userId: targetUserId,
      error: profileError
    })
  }

  return { 
    stack: stackItems || [], 
    profile,
    paths: paths || [] // Returning paths now
  }
}