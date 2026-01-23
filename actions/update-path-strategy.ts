"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface UpdatePathStrategyInput {
  pathId: string
  currentRole: string
  bioContext: string
  mainGoal: string
}

export interface UpdatePathStrategyResult {
  success: boolean
  error?: string
}

export async function updatePathStrategy(
  data: UpdatePathStrategyInput
): Promise<UpdatePathStrategyResult> {
  try {
    const supabase = await createClient()

    // 1. Authenticate
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "User not authenticated" }
    }

    // 2. Update the path record with new strategy data
    const { error: updateError } = await supabase
      .from("upgrade_paths")
      .update({
        role: data.currentRole,
        main_goal: data.mainGoal,
        context: data.bioContext,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.pathId)
      .eq("user_id", user.id) // Ensure user can only update their own paths

    if (updateError) {
      return { success: false, error: "Failed to update path strategy" }
    }

    // 3. Fetch path's primary_pillar for matching
    const { data: pathData, error: pathDataError } = await supabase
      .from("upgrade_paths")
      .select("primary_pillar")
      .eq("id", data.pathId)
      .single()

    const primaryPillar = pathData?.primary_pillar || null

    // 4. Re-run matching with new strategy data
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: `${data.currentRole} ${data.mainGoal} ${data.bioContext}`,
      })
      const userVector = embeddingResponse.data[0].embedding

      // SEARCH TOOLS (Strict Filter: ai_tool)
      const { data: tools, error: toolError } = await supabase.rpc("match_resources", {
        query_embedding: userVector,
        match_threshold: 0.1,
        match_count: 6,
        filter_type: "ai_tool",
        target_pillar: primaryPillar
      })

      let verifiedTools: any[] = []
      if (!toolError && tools) {
        verifiedTools = tools
      }

      // SEARCH COURSES (Strict Filter: human_course)
      const { data: courses, error: courseError } = await supabase.rpc("match_resources", {
        query_embedding: userVector,
        match_threshold: 0.1,
        match_count: 6,
        filter_type: "human_course",
        target_pillar: primaryPillar
      })

      let verifiedCourses: any[] = []
      if (!courseError && courses) {
        verifiedCourses = courses
      }

      // Update matches in the path record
      await supabase
        .from("upgrade_paths")
        .update({
          ai_tools: verifiedTools,
          human_courses: verifiedCourses,
        })
        .eq("id", data.pathId)

      // Insert into path_resources table with status 'suggested'
      // Insert ai_tools
      if (verifiedTools.length > 0) {
        const toolInserts = verifiedTools
          .map((tool: any) => ({
            path_id: data.pathId,
            resource_id: tool.id,
            status: "suggested",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }))
          .filter((item: any) => item.resource_id)

        if (toolInserts.length > 0) {
          const { error: toolsError } = await supabase
            .from("path_resources")
            .upsert(toolInserts, {
              onConflict: "path_id,resource_id",
              ignoreDuplicates: false
            })

          if (toolsError) {
            // Continue - tools may already exist
          }
        }
      }

      // Insert human_courses
      if (verifiedCourses.length > 0) {
        const courseInserts = verifiedCourses
          .map((course: any) => ({
            path_id: data.pathId,
            resource_id: course.id,
            status: "suggested",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }))
          .filter((item: any) => item.resource_id)

        if (courseInserts.length > 0) {
          const { error: coursesError } = await supabase
            .from("path_resources")
            .upsert(courseInserts, {
              onConflict: "path_id,resource_id",
              ignoreDuplicates: false
            })

          if (coursesError) {
            // Continue - courses may already exist
          }
        }
      }
    } catch (err) {
      // Continue even if matching fails - the strategy update was successful
    }

    // Revalidate using slug-based route
    const { data: path } = await supabase
      .from("upgrade_paths")
      .select("slug")
      .eq("id", data.pathId)
      .single()
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle()
    
    if (path?.slug && profile?.username) {
      revalidatePath(`/u/${profile.username}/${path.slug}`)
    }
    // Revalidate unified route (username or userId fallback)
    const usernameOrId = profile?.username || user.id
    revalidatePath(`/u/${usernameOrId}`)
    
    return { success: true }
    
  } catch (error) {
    return { success: false, error: "An unexpected error occurred" }
  }
}
