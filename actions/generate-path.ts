"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface GeneratePathInput {
  currentRole: string
  bioContext: string
  mainGoal: string
  dailyTools: string
  aiComfortLevel: number
  startupIdea?: string
}

export interface GeneratePathResult {
  success: boolean
  error?: string
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

    // 2. Save Profile (CORRECTED SYNTAX)
    // We must assign the result to a variable so we can check 'error'
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        current_role: data.currentRole,
        bio_context: data.bioContext,
        main_goal: data.mainGoal,
        daily_tools: data.dailyTools,
        ai_comfort_level: data.aiComfortLevel,
        startup_idea: data.startupIdea || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' } // Explicitly look for the user_id conflict
    )

    if (profileError) {
      console.error("❌ DB ERROR: Could not save profile:", profileError)
      // Note: We are logging it but continuing execution. 
      // If saving the profile is critical to the app working, you should return { success: false } here.
    } else {
      console.log("✅ Profile updated successfully in DB")
    }

    // 3. Reset Old Paths
    await supabase.from("upgrade_paths").delete().eq("user_id", user.id)

    // =========================================================
    // 🧠 DATABASE MATCHING (FILTERS ENABLED)
    // =========================================================
    let verifiedTools: any[] = []
    let verifiedCourses: any[] = []

    try {
      console.log(`🔎 Generating embedding for: "${data.currentRole}"`)
      
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: `${data.currentRole} ${data.mainGoal} ${data.bioContext}`,
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
    return { success: true }
    
  } catch (error) {
    console.error("❌ CRASH:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}