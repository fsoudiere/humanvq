"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { slugify, generateCopySlug } from "@/lib/slugify"

export interface ClonePathResult {
  success: boolean
  error?: string
  pathId?: string
}

export async function clonePath(pathId: string): Promise<ClonePathResult> {
  console.log("🔄 STARTING CLONE PATH...")
  
  try {
    const supabase = await createClient()

    // 1. Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error("❌ User Auth Failed")
      return { success: false, error: "User not authenticated" }
    }

    // 2. Fetch the original path data (including all fields we need to copy)
    const { data: originalPath, error: fetchError } = await supabase
      .from("upgrade_paths")
      .select(`
        role,
        main_goal,
        context,
        path_title,
        slug,
        efficiency_audit,
        immediate_steps,
        primary_pillar,
        pillar_liability,
        pillar_context,
        pillar_edge_case,
        pillar_connection
      `)
      .eq("id", pathId)
      .eq("user_id", user.id) // Ensure user owns the path
      .single()

    if (fetchError || !originalPath) {
      console.error("❌ Path not found or access denied:", fetchError)
      return { success: false, error: "Path not found or access denied" }
    }

    console.log(`✅ Fetched original path: "${originalPath.path_title || 'Untitled'}"`)

    // 3. Generate unique copy title and slug (for n8n to use)
    const originalTitle = originalPath.path_title || "Untitled Path"
    const copyMatch = originalTitle.match(/^(.+?)\s*\(Copy\s*(\d+)\)$/)
    let copyNumber = 1
    let baseTitle = originalTitle
    
    if (copyMatch) {
      baseTitle = copyMatch[1].trim()
      copyNumber = parseInt(copyMatch[2], 10) + 1
    } else {
      // Check for existing copies to find the next number
      const { data: existingTitles } = await supabase
        .from("upgrade_paths")
        .select("path_title")
        .eq("user_id", user.id)
        .ilike("path_title", `${originalTitle} (Copy%)`)
      
      if (existingTitles && existingTitles.length > 0) {
        const copyNumbers = existingTitles
          .map((p: any) => {
            const match = p.path_title?.match(/\(Copy\s*(\d+)\)$/)
            return match ? parseInt(match[1], 10) : 0
          })
          .filter((n: number) => n > 0)
        
        if (copyNumbers.length > 0) {
          copyNumber = Math.max(...copyNumbers) + 1
        }
      }
    }
    
    const newTitle = `${baseTitle} (Copy ${copyNumber})`
    
    // Generate copy slug
    const originalSlug = originalPath.slug || slugify(originalPath.path_title || "untitled-path")
    const baseSlug = originalSlug.replace(/-copy-\d+$/, "") // Remove existing copy suffix if any
    
    // Get all existing slugs for this user to find the next copy number
    const { data: existingPaths } = await supabase
      .from("upgrade_paths")
      .select("slug")
      .eq("user_id", user.id)
      .not("slug", "is", null)
    
    const existingSlugs = (existingPaths || []).map((p: any) => p.slug).filter(Boolean) as string[]
    const newSlug = generateCopySlug(baseSlug, existingSlugs)
    
    console.log(`📝 Generated copy title: "${newTitle}"`)
    console.log(`📝 Generated copy slug: "${newSlug}"`)

    // 4. Create minimal path record (like generate-path does) - n8n will populate the rest
    // Set slug to null initially - n8n will set it when ready
    const { data: newPath, error: pathCreateError } = await supabase
      .from("upgrade_paths")
      .insert({
        user_id: user.id,
        role: originalPath.role,
        main_goal: originalPath.main_goal,
        context: originalPath.context,
        path_title: "Untitled Path", // Placeholder - n8n will set the actual title
        slug: null, // Will be set by n8n webhook when path_title is ready
        efficiency_audit: null, // n8n will populate
        immediate_steps: null, // n8n will populate
        ai_tools: null,
        human_courses: null,
      })
      .select("id")
      .single()

    if (pathCreateError || !newPath) {
      console.error("❌ Failed to create cloned path record:", pathCreateError)
      return { success: false, error: "Failed to create cloned path" }
    }

    const newPathId = newPath.id
    console.log(`✅ Created minimal cloned path record with ID: ${newPathId}`)

    // 5. Send to n8n with NEW path_id and clone flag
    // n8n will create the path with proper title, slug, and copy all resources
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK
    
    if (!webhookUrl) {
      console.error("❌ CRITICAL ERROR: Webhook URL missing")
      return { success: false, error: "Configuration Error" }
    }

    // Fetch original path resources to send to n8n
    const { data: originalResources } = await supabase
      .from("path_resources")
      .select(`
        resource_id,
        status,
        impact_weight,
        resources (
          id,
          name,
          type,
          description,
          url,
          logodev
        )
      `)
      .eq("path_id", pathId)
      .neq("status", "removed")

    const tools = (originalResources || [])
      .filter((pr: any) => pr.resources?.type === "ai_tool")
      .map((pr: any) => pr.resources)
    const courses = (originalResources || [])
      .filter((pr: any) => pr.resources?.type === "human_course")
      .map((pr: any) => pr.resources)

    console.log(`📦 Sending clone request to n8n...`)
    console.log(`   - New path_id: ${newPathId}`)
    console.log(`   - Original path_id: ${pathId}`)
    console.log(`   - Tools: ${tools.length}`)
    console.log(`   - Courses: ${courses.length}`)

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        path_id: newPathId, // NEW path_id - n8n will process as new path
        is_clone: true, // Flag to indicate this is a clone
        original_path_id: pathId, // Original path for reference
        currentRole: originalPath.role || "",
        bioContext: originalPath.context || "",
        mainGoal: originalPath.main_goal || "",
        // Send suggested title and slug for n8n to use
        suggested_title: newTitle,
        suggested_slug: newSlug,
        // Include existing data so n8n can copy/enhance it
        efficiency_audit: originalPath.efficiency_audit,
        immediate_steps: originalPath.immediate_steps,
        hvq_analysis: {
          primary_pillar: originalPath.primary_pillar,
          pillars: {
            liability: originalPath.pillar_liability,
            context: originalPath.pillar_context,
            edgeCase: originalPath.pillar_edge_case,
            connection: originalPath.pillar_connection,
          }
        },
        // Send resources to copy
        verified_matches: {
          tools: tools,
          courses: courses
        }
      }),
    })

    if (!response.ok) {
      console.error(`❌ n8n Error for clone: ${response.status}`)
      return { success: false, error: "AI Agent refused connection" }
    }
    
    console.log("✅ SUCCESS: Clone request sent to n8n!")
    console.log("   Frontend will poll for path to be ready (slug will be set by n8n)")
    
    revalidatePath("/")
    // Return pathId - frontend will poll for slug like create-path flow
    return { success: true, pathId: newPathId }
  } catch (error) {
    console.error("❌ Error cloning path:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}
