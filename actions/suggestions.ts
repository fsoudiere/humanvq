"use server"

import { createClient } from "@/utils/supabase/server"

export interface SubmitSuggestionResult {
  success: boolean
  error?: string
  message?: string
}

export async function submitSuggestion(data: { name: string; url: string; type: string }): Promise<SubmitSuggestionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  // 1. Log to your DB as a backup/audit trail
  await supabase.from("resource_suggestions").insert({
    user_id: user.id,
    name: data.name,
    url: data.url,
    type: data.type,
  })

  // 2. Trigger n8n Automation
  // Replace this URL with your actual n8n Webhook URL
  const N8N_WEBHOOK_URL2 = process.env.NEXT_PUBLIC_N8N_WEBHOOK2

  if (!N8N_WEBHOOK_URL2) {
    return { success: true, message: "Logged, but automation not configured." }
  }

  try {
    const response = await fetch(N8N_WEBHOOK_URL2, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        userId: user.id,
        submittedAt: new Date().toISOString()
      }),
    })

    if (!response.ok) throw new Error("n8n failed")

    return { success: true }
  } catch (err) {
    // We still return success if the DB insert worked, even if n8n is down
    return { success: true, message: "Logged, but automation pending." }
  }
}