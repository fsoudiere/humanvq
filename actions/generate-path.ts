"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export interface GeneratePathInput {
  currentRole: string
  mainGoal: string
  biggestPain: string
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
  try {
    const supabase = await createClient()

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return {
        success: false,
        error: "User not authenticated",
      }
    }

    // Save to profiles table
    const { error: profileError } = await supabase.from("profiles").upsert({
      user_id: user.id,
      current_role: data.currentRole,
      main_goal: data.mainGoal,
      biggest_pain: data.biggestPain,
      daily_tools: data.dailyTools,
      ai_comfort_level: data.aiComfortLevel,
      startup_idea: data.startupIdea || null,
      updated_at: new Date().toISOString(),
    })

    if (profileError) {
      console.error("Error saving profile:", profileError)
      return {
        success: false,
        error: "Failed to save profile",
      }
    }

    // Send to n8n webhook
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK
    if (!webhookUrl) {
      return {
        success: false,
        error: "Webhook URL not configured",
      }
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          ...data,
        }),
      })

      if (!response.ok) {
        console.error("Webhook error:", response.status, response.statusText)
        return {
          success: false,
          error: "Failed to trigger analysis",
        }
      }
    } catch (fetchError) {
      console.error("Error calling webhook:", fetchError)
      return {
        success: false,
        error: "Failed to connect to analysis service",
      }
    }

    // Revalidate the page to trigger a refresh
    revalidatePath("/")

    return {
      success: true,
    }
  } catch (error) {
    console.error("Error in generatePath:", error)
    return {
      success: false,
      error: "An unexpected error occurred",
    }
  }
}
