"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export interface AddResourceToPathResult {
  success: boolean
  error?: string
}

export interface RemoveResourceFromPathResult {
  success: boolean
  error?: string
}

export interface UpdateResourceStatusResult {
  success: boolean
  error?: string
  newScore?: number
}

/**
 * Calculation Helper: Calculate HVQ score for a given path
 * Fetches all path_resources, immediate_steps, and delegate_tasks for a pathId
 * Returns a single number: (hvq_score_machine/human * impact_weight) + Steps + Delegate Tasks + 100
 */
async function calculatePathHVQScore(pathId: string): Promise<number | null> {
  const supabase = await createClient()
  
  // Fetch all path data needed for calculation
  const { data: pathData, error: pathDataError } = await supabase
    .from("upgrade_paths")
    .select(`
      immediate_steps,
      efficiency_audit,
      path_resources (
        status,
        impact_weight,
        resources (
          hvq_score_machine,
          hvq_score_human
        )
      )
    `)
    .eq("id", pathId)
    .single()

  if (pathDataError || !pathData) {
    console.error("Failed to fetch path data for HVQ calculation:", pathDataError)
    return null
  }

  // Base Score: 100
  const BASE_SCORE = 100
  
  // Completed Steps: (Count * 15)
  // Parse immediate_steps (could be JSON string or object)
  const immediateSteps = typeof pathData.immediate_steps === 'string'
    ? JSON.parse(pathData.immediate_steps || '[]')
    : (pathData.immediate_steps || [])
  
  const completedSteps = Array.isArray(immediateSteps)
    ? immediateSteps.filter((step: any) => step.is_completed).length
    : 0
  const stepPoints = completedSteps * 15
  
  // Delegate Tasks: (Count * 10)
  // Parse efficiency_audit (could be JSON string or object)
  const efficiencyAudit = typeof pathData.efficiency_audit === 'string'
    ? JSON.parse(pathData.efficiency_audit || '{}')
    : (pathData.efficiency_audit || {})
  
  const completedDelegateTasks = Array.isArray(efficiencyAudit.delegate_to_machine)
    ? efficiencyAudit.delegate_to_machine.filter((task: any) => task.is_completed).length
    : 0
  const delegatePoints = completedDelegateTasks * 10
  
  // Weighted Resources: SUM of (hvq_score_machine/human * impact_weight)
  // Filter out removed resources (status = 'removed') as they have impact_weight = 0
  let resourcePoints = 0
  if (pathData.path_resources && Array.isArray(pathData.path_resources)) {
    pathData.path_resources.forEach((pr: any) => {
      // Only count resources that are not removed
      if (pr.resources && pr.status !== 'removed') {
        // Get resource leverage (hvq_score_machine for tools, hvq_score_human for courses)
        const leverage = pr.resources.hvq_score_machine || pr.resources.hvq_score_human || 0
        // Get impact_weight from path_resources table
        const impactWeight = pr.impact_weight || 0
        // Sum: resource_leverage * impact_weight
        resourcePoints += leverage * impactWeight
      }
    })
  }
  
  // Total: Base Score + Step Points + Delegate Points + Weighted Resources
  return BASE_SCORE + stepPoints + delegatePoints + Math.round(resourcePoints)
}

/**
 * Add a resource to a path
 * - Creates/updates path_resources record with status 'wishlisted'
 * - path_resources is now the single source of truth
 */
export async function addResourceToPath(
  pathId: string,
  resourceId: string
): Promise<AddResourceToPathResult> {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // Verify path ownership
  const { data: path, error: pathError } = await supabase
    .from("upgrade_paths")
    .select("user_id")
    .eq("id", pathId)
    .single()

  if (pathError || !path) {
    return { success: false, error: "Path not found" }
  }

  if (path.user_id !== user.id) {
    return { success: false, error: "You can only modify your own paths" }
  }

  // Check if path_resource already exists
  const { data: existingPathResource } = await supabase
    .from("path_resources")
    .select("id, status")
    .eq("path_id", pathId)
    .eq("resource_id", resourceId)
    .maybeSingle()

  // If exists, update to 'wishlisted'; otherwise insert new record
  let pathResourceError = null
  
  if (existingPathResource) {
    // Update existing record
    console.log("📝 Updating existing path_resource to 'wishlisted'")
    const { error: updateError } = await supabase
      .from("path_resources")
      .update({
        status: "wishlisted",
        user_id: user.id, // Ensure user_id is set for RLS
        updated_at: new Date().toISOString()
      })
      .eq("id", existingPathResource.id)
    
    pathResourceError = updateError
  } else {
    // Insert new record
    console.log("➕ Inserting new path_resource with status 'wishlisted'")
    const { error: insertError } = await supabase
      .from("path_resources")
      .insert({
        path_id: pathId,
        resource_id: resourceId,
        user_id: user.id, // CRITICAL FOR RLS
        status: "wishlisted",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    
    pathResourceError = insertError
  }

  if (pathResourceError) {
    // Log detailed error information for debugging
    console.error("❌ Failed to add/update tool in path_resources:", {
      error: pathResourceError,
      code: pathResourceError.code,
      message: pathResourceError.message,
      details: pathResourceError.details,
      hint: pathResourceError.hint,
      pathId,
      resourceId,
      userId: user.id,
      existing: !!existingPathResource
    })
    
    // Return detailed error message for better debugging
    const errorMessage = pathResourceError.message || pathResourceError.details || pathResourceError.hint || "Unknown error"
    return { 
      success: false, 
      error: `Failed to ${existingPathResource ? 'update' : 'add'} tool to path: ${errorMessage}` 
    }
  }

  // UI Feedback: Revalidate both Path URL and Profile URL
  // This ensures Path Badges on the Profile page stay in sync when status changes
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
    revalidatePath(`/u/${profile.username}/${pathWithSlug.slug}`) // Path page
    revalidatePath(`/u/${profile.username}`) // Profile page (for path badges)
  }

  return { success: true }
}

/**
 * Remove a resource from a path
 * - Updates path_resources record with status 'removed'
 */
export async function removeResourceFromPath(
  pathId: string,
  resourceId: string
): Promise<RemoveResourceFromPathResult> {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // Verify path ownership
  const { data: path, error: pathError } = await supabase
    .from("upgrade_paths")
    .select("user_id")
    .eq("id", pathId)
    .single()

  if (pathError || !path) {
    return { success: false, error: "Path not found" }
  }

  if (path.user_id !== user.id) {
    return { success: false, error: "You can only modify your own paths" }
  }

  // Update path_resources with status 'removed'
  // Include user_id for RLS policy compliance
  const { error: pathResourceError } = await supabase
    .from("path_resources")
    .upsert({
      path_id: pathId,
      resource_id: resourceId,
      user_id: user.id, // CRITICAL FOR RLS
      status: "removed",
      updated_at: new Date().toISOString()
    }, {
      onConflict: "path_id,resource_id"
    })

  if (pathResourceError) {
    console.error("Failed to remove tool from path:", pathResourceError)
    return { success: false, error: "Failed to remove tool from path" }
  }

  // UI Feedback: Revalidate both Path URL and Profile URL
  // This ensures Path Badges on the Profile page stay in sync when status changes
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
    revalidatePath(`/u/${profile.username}/${pathWithSlug.slug}`) // Path page
    revalidatePath(`/u/${profile.username}`) // Profile page (for path badges)
  }

  return { success: true }
}

/**
 * Update resource status in path_resources
 * 
 * Relational Upsert: Uses .upsert() with onConflict to overwrite existing status
 * (e.g., if resource is already 'suggested', we simply overwrite to 'added_paid', etc.)
 * 
 * Type-Aware Status Validation:
 * - If resource is ai_tool: only allow added_free, added_paid, wishlisted, removed, suggested
 * - If resource is human_course: only allow added_enrolled, added_completed, wishlisted, removed, suggested
 * 
 * Single Source of Truth: path_resources is now the only table used for tracking
 * user tools and courses. No sync with user_stacks needed.
 */
export async function updateResourceStatus(
  pathId: string,
  resourceId: string,
  status: 'suggested' | 'added_free' | 'added_paid' | 'added_enrolled' | 'added_completed' | 'wishlisted' | 'removed'
): Promise<UpdateResourceStatusResult> {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // Verify path ownership
  const { data: path, error: pathError } = await supabase
    .from("upgrade_paths")
    .select("user_id")
    .eq("id", pathId)
    .single()

  if (pathError || !path) {
    return { success: false, error: "Path not found" }
  }

  if (path.user_id !== user.id) {
    return { success: false, error: "You can only modify your own paths" }
  }

  // Fetch resource type to validate status
  const { data: resource, error: resourceError } = await supabase
    .from("resources")
    .select("type")
    .eq("id", resourceId)
    .single()

  if (resourceError || !resource) {
    return { success: false, error: "Resource not found" }
  }

  // Type-Aware Status Validation
  const isCourse = resource.type === "human_course"
  const isTool = resource.type === "ai_tool"

  // Validate status based on resource type
  if (isTool) {
    // Tools: only allow added_free, added_paid, wishlisted, removed, suggested
    const validToolStatuses = ['suggested', 'added_free', 'added_paid', 'wishlisted', 'removed']
    if (!validToolStatuses.includes(status)) {
      return { success: false, error: `Invalid status for tool: ${status}. Allowed: ${validToolStatuses.join(', ')}` }
    }
  } else if (isCourse) {
    // Courses: only allow added_enrolled, added_completed, wishlisted, removed, suggested
    const validCourseStatuses = ['suggested', 'added_enrolled', 'added_completed', 'wishlisted', 'removed']
    if (!validCourseStatuses.includes(status)) {
      return { success: false, error: `Invalid status for course: ${status}. Allowed: ${validCourseStatuses.join(', ')}` }
    }
  } else {
    return { success: false, error: `Unknown resource type: ${resource.type}` }
  }

  // Step 1: Update Path - First, upsert into path_resources
  // Using .upsert() with onConflict ensures that if a resource is already 'suggested',
  // we simply overwrite its status to 'added_paid', 'added_free', etc.
  // Include user_id for RLS policy compliance
  // Define impact weights for HVQ calculation
  const weights: Record<string, number> = {
    suggested: 0.5,
    added_free: 1.0,
    added_enrolled: 1.0,
    added_paid: 1.5,
    added_completed: 1.5,
    wishlisted: 0.2,
    removed: 0
  }
  
  // Valid columns: path_id, resource_id, user_id, status, impact_weight, updated_at (created_at is auto-generated)
  const { error: pathResourceError } = await supabase
    .from("path_resources")
    .upsert({
      path_id: pathId,
      resource_id: resourceId,
      user_id: user.id, // CRITICAL FOR RLS
      status: status,
      impact_weight: weights[status] || 0,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "path_id,resource_id"
    })

  if (pathResourceError) {
    console.error('DATABASE ERROR:', JSON.stringify(pathResourceError, null, 2))
    return { success: false, error: "Failed to update resource status" }
  }

  // Note: path_resources is now the single source of truth
  // No need to sync with user_stacks anymore

  // Step 3: Calculate and Update HVQ Score
  // The Save Handshake: After upserting the tool status, calculate and save the new total
  // Fetch current score before calculation for rotation
  const { data: currentPathData } = await supabase
    .from("upgrade_paths")
    .select("current_hvq_score")
    .eq("id", pathId)
    .single()
  
  const currentScore = currentPathData?.current_hvq_score || null
  
  // Calculate the new total for the path using the helper function
  const newScore = await calculatePathHVQScore(pathId)
  
  if (newScore !== null) {
    // Update upgrade_paths: set previous_hvq_score = current_hvq_score and current_hvq_score = [NEW_TOTAL]
    const { error: scoreUpdateError } = await supabase
      .from("upgrade_paths")
      .update({
        previous_hvq_score: currentScore,
        current_hvq_score: newScore
      })
      .eq("id", pathId)
    
    if (scoreUpdateError) {
      console.error("Failed to update HVQ score:", scoreUpdateError)
      // Continue anyway - path_resources update was successful
    }
  }

  // Step 4: Revalidate - Call revalidatePath for both the specific path and the general profile page
  // This ensures the user sees the changes instantly
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
    revalidatePath(`/u/${profile.username}/${pathWithSlug.slug}`) // Path page
    revalidatePath(`/u/${profile.username}`) // Profile page (for path badges)
  }

  // Return the Score: Ensure the action returns the new score so the UI can update instantly
  return { 
    success: true, 
    newScore: newScore !== null ? newScore : undefined
  }
}
