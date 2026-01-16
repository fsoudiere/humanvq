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

  // 3. Fetch path_resources with path titles for each resource
  // This shows which paths each tool/course is assigned to
  let pathResourcesData: any[] = []
  if (paths && paths.length > 0) {
    const pathIds = paths.map((p: any) => p.id)
    const { data } = await supabase
      .from("path_resources")
      .select(`
        resource_id,
        status,
        upgrade_paths (
          id,
          path_title,
          main_goal,
          slug
        )
      `)
      .eq("status", "added") // Only show tools that are added (not removed)
      .in("path_id", pathIds)
    
    pathResourcesData = data || []
  }
  
  // Build a map of resource_id -> array of paths
  const resourcePathsMap: Record<string, Array<{ id: string; title: string; slug: string }>> = {}
  if (pathResourcesData) {
    pathResourcesData.forEach((pr: any) => {
      // Supabase returns the joined table with the table name
      const path = pr.upgrade_paths
      if (path && pr.resource_id) {
        if (!resourcePathsMap[pr.resource_id]) {
          resourcePathsMap[pr.resource_id] = []
        }
        resourcePathsMap[pr.resource_id].push({
          id: path.id,
          title: path.path_title || path.main_goal || "Untitled Path",
          slug: path.slug || path.id
        })
      }
    })
  }

  // Attach path information to each stack item
  const stackItemsWithPaths = (stackItems || []).map((item: any) => ({
    ...item,
    paths: resourcePathsMap[item.resource?.id] || []
  }))

  if (stackError) {
    console.error("Error fetching stack:", stackError)
    return null
  }

  // 4. Fetch Profile (using maybeSingle to handle missing profiles gracefully)
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
    stack: stackItemsWithPaths || [], 
    profile,
    paths: paths || [] // Returning paths now
  }
}