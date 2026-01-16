"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export interface UpdateProfileInput {
  full_name?: string
  username?: string
  is_organization?: boolean
  organization_name?: string | null
}

export interface UpdateProfileResult {
  success: boolean
  error?: string
}

export async function updateProfile(
  data: UpdateProfileInput
): Promise<UpdateProfileResult> {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  // Build update payload
  const updatePayload: any = {
    updated_at: new Date().toISOString(),
  }

  if (data.full_name !== undefined) {
    updatePayload.full_name = data.full_name
  }

  if (data.username !== undefined) {
    updatePayload.username = data.username
  }

  if (data.is_organization !== undefined) {
    updatePayload.is_organization = data.is_organization
  }

  if (data.organization_name !== undefined) {
    updatePayload.organization_name = data.organization_name
  }

  // Update the profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("user_id", user.id)

  if (updateError) {
    console.error("Failed to update profile:", updateError)
    return { success: false, error: "Failed to update profile" }
  }

  revalidatePath("/settings")
  return { success: true }
}
