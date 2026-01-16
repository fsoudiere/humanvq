"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { slugify, generateUniqueSlug } from "@/lib/slugify"

export async function updatePathTitle(pathId: string, title: string) {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // Generate slug from title
  const slugBase = title || "untitled-path"
  let slug = slugify(slugBase)
  
  // Check for slug collisions for this user (excluding current path)
  const { data: existingPaths } = await supabase
    .from("upgrade_paths")
    .select("slug")
    .eq("user_id", user.id)
    .neq("id", pathId)
    .not("slug", "is", null)
  
  const existingSlugs = (existingPaths || []).map(p => p.slug).filter(Boolean) as string[]
  
  // If slug already exists, append random number
  if (existingSlugs.includes(slug)) {
    slug = generateUniqueSlug(slug)
  }

  // Update the path title and slug (only if user owns it)
  const { error: updateError } = await supabase
    .from("upgrade_paths")
    .update({ 
      path_title: title, 
      slug: slug,
      updated_at: new Date().toISOString() 
    })
    .eq("id", pathId)
    .eq("user_id", user.id) // Ensure user can only update their own paths

  if (updateError) {
    console.error("Failed to update path title:", updateError)
    return { success: false, error: "Failed to update path title" }
  }

  // Revalidate using slug-based route
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle()
  
  if (profile?.username) {
    revalidatePath(`/u/${profile.username}/${slug}`)
  }
  // Revalidate unified route (username or userId fallback)
  const usernameOrId = profile?.username || user.id
  revalidatePath(`/u/${usernameOrId}`)
  
  // Return the new slug so the client can redirect to the new URL
  return { success: true, newSlug: slug }
}
