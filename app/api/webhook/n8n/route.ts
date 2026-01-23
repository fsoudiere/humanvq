import { createClient } from "@/utils/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { slugify, generateUniqueSlug } from "@/lib/slugify"
import { calculatePathHVQScore } from "@/actions/path-resources"

/**
 * Webhook endpoint for n8n to send processed path data.
 *
 * Expected body (all optional except path_id):
 * - path_id (required)
 * - path_title, ai_tools, human_courses
 * - efficiency_audit: { delegate_to_machine: [...], keep_for_human: [...] }
 * - immediate_steps: [{ text, is_completed }]
 * - hvq_analysis: { primary_pillar, pillars: { liability, context, edgeCase, connection } }
 *   - primary_pillar → upgrade_paths.primary_pillar
 *   - pillars.liability → pillar_liability, etc. (0–1)
 * - human_pillars (legacy): { liability, context, edgeCase, connection } if hvq_analysis.pillars absent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { path_id, ai_tools, human_courses, path_title } = body
    const hvq_analysis = body.hvq_analysis
    const efficiency_audit = body.efficiency_audit ?? hvq_analysis?.efficiency_audit
    const immediate_steps = body.immediate_steps ?? hvq_analysis?.immediate_steps
    const pillarsSource = hvq_analysis?.pillars ?? body.human_pillars

    if (!path_id) {
      return NextResponse.json(
        { error: "path_id is required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: path, error: pathError } = await supabase
      .from("upgrade_paths")
      .select("user_id, slug, path_title")
      .eq("id", path_id)
      .single()

    if (pathError || !path) {
      console.error("❌ Path not found:", pathError)
      return NextResponse.json(
        { error: "Path not found" },
        { status: 404 }
      )
    }

    let updatedSlug = path.slug

    // Build upgrade_paths update: path_title/slug, efficiency_audit, immediate_steps, human_pillars
    const pathUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (path_title != null && path_title !== "") {
      const slugBase = path_title || "untitled-path"
      let newSlug = slugify(slugBase)
      const { data: existingPaths } = await supabase
        .from("upgrade_paths")
        .select("slug")
        .eq("user_id", path.user_id)
        .neq("id", path_id)
        .not("slug", "is", null)
      const existingSlugs = (existingPaths || []).map((p: any) => p.slug).filter(Boolean) as string[]
      if (existingSlugs.includes(newSlug)) newSlug = generateUniqueSlug(newSlug)
      pathUpdate.path_title = path_title
      pathUpdate.slug = newSlug
      updatedSlug = newSlug
    }

    if (efficiency_audit != null) pathUpdate.efficiency_audit = efficiency_audit
    if (immediate_steps != null) pathUpdate.immediate_steps = immediate_steps

    if (hvq_analysis?.primary_pillar != null && String(hvq_analysis.primary_pillar).trim() !== "") {
      pathUpdate.primary_pillar = String(hvq_analysis.primary_pillar).trim()
    }

    if (pillarsSource && typeof pillarsSource === "object") {
      const hp = pillarsSource as Record<string, unknown>
      const clamp = (v: unknown) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : undefined)
      if (clamp(hp.liability) !== undefined) pathUpdate.pillar_liability = clamp(hp.liability)
      if (clamp(hp.context) !== undefined) pathUpdate.pillar_context = clamp(hp.context)
      if (clamp(hp.edgeCase) !== undefined) pathUpdate.pillar_edge_case = clamp(hp.edgeCase)
      if (clamp(hp.connection) !== undefined) pathUpdate.pillar_connection = clamp(hp.connection)
    }

    const hasPillars = pillarsSource && typeof pillarsSource === "object" &&
      [ "liability", "context", "edgeCase", "connection" ].some((k) => typeof (pillarsSource as Record<string, unknown>)[ k ] === "number")
    const hasPathUpdates =
      (path_title != null && path_title !== "") ||
      efficiency_audit != null ||
      immediate_steps != null ||
      (hvq_analysis?.primary_pillar != null && String(hvq_analysis.primary_pillar).trim() !== "") ||
      hasPillars

    if (hasPathUpdates) {
      const { error: updateError } = await supabase
        .from("upgrade_paths")
        .update(pathUpdate)
        .eq("id", path_id)

      if (updateError) {
        console.error("❌ Failed to update upgrade_paths:", updateError)
      } else {
        if (path_title) console.log(`✅ Updated path_title "${path_title}" and slug to "${pathUpdate.slug}"`)
        if (efficiency_audit != null) console.log("✅ Updated efficiency_audit")
        if (immediate_steps != null) console.log("✅ Updated immediate_steps")
        if (pathUpdate.primary_pillar) console.log("✅ Updated primary_pillar from hvq_analysis")
        if (hasPillars) console.log("✅ Updated pillar_* from hvq_analysis.pillars or human_pillars")
      }
    }

    // Get profile for username (for revalidation)
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", path.user_id)
      .maybeSingle()

    // Define impact weights for HVQ calculation (must match path-resources.ts)
    const weights: Record<string, number> = {
      suggested: 0.5,
      added_free: 1.0,
      added_enrolled: 1.0,
      added_paid: 1.5,
      added_completed: 1.5,
      wishlisted: 0.2,
      removed: 0
    }

    // Process ai_tools
    if (Array.isArray(ai_tools) && ai_tools.length > 0) {
      const toolInserts = ai_tools.map((tool: any) => ({
        path_id: path_id,
        resource_id: tool.id || tool.resource_id,
        user_id: path.user_id, // CRITICAL FOR RLS
        status: "suggested",
        impact_weight: weights["suggested"] || 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })).filter((item: any) => item.resource_id) // Only include items with resource_id

      if (toolInserts.length > 0) {
        // Use upsert to handle duplicates (onConflict: path_id, resource_id)
        const { error: toolsError } = await supabase
          .from("path_resources")
          .upsert(toolInserts, {
            onConflict: "path_id,resource_id",
            ignoreDuplicates: false
          })

        if (toolsError) {
          console.error("❌ Failed to insert ai_tools into path_resources:", toolsError)
        } else {
          console.log(`✅ Inserted ${toolInserts.length} tools into path_resources for path ${path_id}`)
        }
      }
    }

    // Process human_courses
    if (Array.isArray(human_courses) && human_courses.length > 0) {
      const courseInserts = human_courses.map((course: any) => ({
        path_id: path_id,
        resource_id: course.id || course.resource_id,
        user_id: path.user_id, // CRITICAL FOR RLS
        status: "suggested",
        impact_weight: weights["suggested"] || 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })).filter((item: any) => item.resource_id) // Only include items with resource_id

      if (courseInserts.length > 0) {
        // Use upsert to handle duplicates (onConflict: path_id, resource_id)
        const { error: coursesError } = await supabase
          .from("path_resources")
          .upsert(courseInserts, {
            onConflict: "path_id,resource_id",
            ignoreDuplicates: false
          })

        if (coursesError) {
          console.error("❌ Failed to insert human_courses into path_resources:", coursesError)
        } else {
          console.log(`✅ Inserted ${courseInserts.length} courses into path_resources for path ${path_id}`)
        }
      }
    }

    // =========================================================
    // 📊 RECALCULATE HVQ SCORE AFTER PILLAR DATA IS SAVED
    // =========================================================
    // This ensures that after n8n provides the pillar data, we recalculate
    // the HVQ score with accurate vulnerability values instead of placeholder 100
    // Run this AFTER all data is saved (pillars, efficiency_audit, resources)
    // This happens after efficiency_audit, pillars, and primary_pillar are updated above
    if (hasPillars || efficiency_audit != null || hvq_analysis?.primary_pillar != null) {
      try {
        console.log("📊 Recalculating HVQ score with updated pillar data...")
        const updatedScore = await calculatePathHVQScore(path_id)

        if (updatedScore !== null) {
          // Get current score before update for rotation (only if updating existing score)
          const { data: currentPathData } = await supabase
            .from("upgrade_paths")
            .select("current_hvq_score")
            .eq("id", path_id)
            .single()

          const currentScore = currentPathData?.current_hvq_score || null

          // Update with new calculated score
          const { error: hvqUpdateError } = await supabase
            .from("upgrade_paths")
            .update({
              previous_hvq_score: currentScore,
              current_hvq_score: updatedScore
            })
            .eq("id", path_id)

          if (hvqUpdateError) {
            console.error("❌ Failed to update HVQ score after pillar update:", hvqUpdateError)
          } else {
            console.log(`✅ Recalculated and updated HVQ score: ${currentScore ?? 'null'} → ${updatedScore}`)
            
            // Revalidate dashboard to show updated score immediately
            // Dashboard is at /u/[username] route
            if (profile?.username) {
              revalidatePath(`/u/${profile.username}`)
            }
          }
        } else {
          console.error("❌ HVQ calculation returned null after pillar update")
        }
      } catch (scoreError) {
        console.error("❌ Failed to recalculate/save HVQ score in webhook:", scoreError)
        // Continue - path data was saved successfully
      }
    }

    // Revalidate the path page (use updated slug if it was changed)
    if (updatedSlug && profile?.username) {
      revalidatePath(`/u/${profile.username}/${updatedSlug}`)
      revalidatePath(`/u/${profile.username}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ Webhook error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
