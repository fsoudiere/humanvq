"use server"
import { createClient } from "@/utils/supabase/server"

export async function submitSuggestion(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "You must be logged in" }

  const { error } = await supabase.from("resource_suggestions").insert({
    user_id: user.id,
    name: formData.get("name"),
    url: formData.get("url"),
    type: formData.get("type"),
  })

  if (error) return { error: "Failed to submit" }
  return { success: true }
}