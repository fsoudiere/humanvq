import { createClient } from "@/utils/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

/**
 * Webhook endpoint for n8n to send processed path data
 * Receives JSON with ai_tools and human_courses arrays
 * Inserts records into path_resources table with status 'suggested'
 * 
 * Note: This webhook may need to use a service role key or have RLS policies
 * configured to allow inserts. Consider adding authentication/authorization
 * (e.g., secret token validation) for production use.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { path_id, ai_tools, human_courses } = body

    if (!path_id) {
      return NextResponse.json(
        { error: "path_id is required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify path exists and get user_id for revalidation
    const { data: path, error: pathError } = await supabase
      .from("upgrade_paths")
      .select("user_id, slug")
      .eq("id", path_id)
      .single()

    if (pathError || !path) {
      console.error("❌ Path not found:", pathError)
      return NextResponse.json(
        { error: "Path not found" },
        { status: 404 }
      )
    }

    // Get profile for username (for revalidation)
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", path.user_id)
      .maybeSingle()

    // Process ai_tools
    if (Array.isArray(ai_tools) && ai_tools.length > 0) {
      const toolInserts = ai_tools.map((tool: any) => ({
        path_id: path_id,
        resource_id: tool.id || tool.resource_id,
        user_id: path.user_id, // CRITICAL FOR RLS
        status: "suggested",
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

    // Revalidate the path page
    if (path.slug && profile?.username) {
      revalidatePath(`/u/${profile.username}/${path.slug}`)
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
