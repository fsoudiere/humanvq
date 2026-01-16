"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"
import { slugify, generateUniqueSlug } from "@/lib/slugify"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface GeneratePathInput {
  currentRole: string
  bioContext: string
  mainGoal: string
}

export interface GeneratePathResult {
  success: boolean
  error?: string
  pathId?: string
  slug?: string
}

export async function generatePath(
  data: GeneratePathInput
): Promise<GeneratePathResult> {
  console.log("🚀 STARTING GENERATE PATH...")

  try {
    const supabase = await createClient()

    // 1. Authenticate
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error("❌ User Auth Failed")
      return { success: false, error: "User not authenticated" }
    }

    // 2. Generate slug from main_goal or role
    const slugBase = data.mainGoal || data.currentRole || "untitled-path"
    let slug = slugify(slugBase)
    
    // Check for slug collisions for this user
    const { data: existingPaths } = await supabase
      .from("upgrade_paths")
      .select("slug")
      .eq("user_id", user.id)
      .not("slug", "is", null)
    
    const existingSlugs = (existingPaths || []).map(p => p.slug).filter(Boolean) as string[]
    
    // If slug already exists, append random number
    if (existingSlugs.includes(slug)) {
      slug = generateUniqueSlug(slug)
    }

    // 3. Create a new path record with intake data and slug
    const { data: newPath, error: pathCreateError } = await supabase
      .from("upgrade_paths")
      .insert({
        user_id: user.id,
        role: data.currentRole,
        main_goal: data.mainGoal,
        context: data.bioContext,
        slug: slug,
        efficiency_audit: null,
        ai_tools: null,
        human_courses: null,
        immediate_steps: null,
      })
      .select("id, slug")
      .single()

    if (pathCreateError || !newPath) {
      console.error("❌ Failed to create path record:", pathCreateError)
      return { success: false, error: "Failed to create path" }
    }

    const pathId = newPath.id
    console.log(`✅ Created path record with ID: ${pathId} and slug: ${slug}`)

    // Fetch the path record to use its data for matching
    const { data: pathRecord, error: pathFetchError } = await supabase
      .from("upgrade_paths")
      .select("role, main_goal, context")
      .eq("id", pathId)
      .single()

    if (pathFetchError || !pathRecord) {
      console.error("❌ Failed to fetch path record:", pathFetchError)
      return { success: false, error: "Failed to fetch path record" }
    }

    // =========================================================
    // 🧠 DATABASE MATCHING (FILTERS ENABLED)
    // =========================================================
    let verifiedTools: any[] = []
    let verifiedCourses: any[] = []

    try {
      // Use the path record's data for embedding (role, main_goal, context from upgrade_paths)
      const embeddingInput = `${pathRecord.role} ${pathRecord.main_goal} ${pathRecord.context}`
      console.log(`🔎 Generating embedding from path record: "${pathRecord.role}"`)
      
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: embeddingInput,
      })
      const userVector = embeddingResponse.data[0].embedding

      // SEARCH TOOLS (Strict Filter: ai_tool)
      const { data: tools, error: toolError } = await supabase.rpc("match_resources", {
        query_embedding: userVector,
        match_threshold: 0.1, // Keep this low to ensure matches
        match_count: 3,       // Get top 3
        min_machine_score: 1,
        min_human_score: 0,
        filter_type: "ai_tool" 
      })

      if (toolError) {
        console.error("❌ DB Tool Error:", toolError)
      } else if (tools) {
        console.log(`✅ VERIFIED TOOLS:`, tools.map((t: any) => t.name))
        verifiedTools = tools
      }

      // SEARCH COURSES (Strict Filter: human_course)
      const { data: courses, error: courseError } = await supabase.rpc("match_resources", {
        query_embedding: userVector,
        match_threshold: 0.1,
        match_count: 3,
        min_machine_score: 0,
        min_human_score: 1,
        filter_type: "human_course"
      })

      if (courseError) {
        console.error("❌ DB Course Error:", courseError)
      } else if (courses) {
        console.log(`✅ VERIFIED COURSES:`, courses.map((c: any) => c.name))
        verifiedCourses = courses
      }

    } catch (err) {
      console.error("⚠️ Matching Logic Crash:", err)
    }

    // =========================================================
    // 💾 SAVE MATCHES TO PATH RECORD
    // =========================================================
    const { error: updateError } = await supabase
      .from("upgrade_paths")
      .update({
        ai_tools: verifiedTools,
        human_courses: verifiedCourses,
      })
      .eq("id", pathId)

    if (updateError) {
      console.error("❌ Failed to save matches to path:", updateError)
      // Continue execution - matches will still be sent to n8n
    } else {
      console.log(`✅ Saved ${verifiedTools.length} tools and ${verifiedCourses.length} courses to path ${pathId}`)
    }

    // =========================================================
    // 🚀 SEND TO N8N
    // =========================================================
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK
    
    if (!webhookUrl) {
      console.error("❌ CRITICAL ERROR: Webhook URL missing")
      return { success: false, error: "Configuration Error" }
    }

    // LOG WHAT WE ARE SENDING
    console.log(`📦 Sending Payload to n8n...`)
    console.log(`   - Tools: ${verifiedTools.length}`)
    console.log(`   - Courses: ${verifiedCourses.length}`)

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        path_id: pathId,
        ...data,
        verified_matches: {
          tools: verifiedTools,
          courses: verifiedCourses
        }
      }),
    })

    if (!response.ok) {
      console.error(`❌ n8n Error: ${response.status}`)
      return { success: false, error: "AI Agent refused connection" }
    }
    
    console.log("✅ SUCCESS: Data sent to n8n!")
    revalidatePath("/")
    return { success: true, pathId, slug: newPath.slug }
    
  } catch (error) {
    console.error("❌ CRASH:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}