"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

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

  // Fetch current profile to detect username change
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle()

  const currentUsername = currentProfile?.username || null
  const newUsername = data.username?.trim() || null
  const usernameChanged = newUsername && newUsername !== currentUsername

  // If username is being changed, check for conflicts BEFORE updating
  if (usernameChanged && newUsername) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("username", newUsername)
      .maybeSingle()

    // If username exists and belongs to a different user, it's taken
    if (existingProfile && existingProfile.user_id !== user.id) {
      return { success: false, error: "This username is already taken" }
    }
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
    // Check if it's a unique constraint violation (username conflict)
    // This is a fallback check in case the pre-check missed it
    if (
      updateError.code === "23505" || 
      updateError.message?.toLowerCase().includes("unique") || 
      updateError.message?.toLowerCase().includes("duplicate") ||
      updateError.message?.toLowerCase().includes("violates unique constraint")
    ) {
      return { success: false, error: "This username is already taken" }
    }
    return { success: false, error: "Failed to update profile" }
  }

  // Revalidate global cache to update Header everywhere BEFORE redirect
  revalidatePath("/", "layout")
  revalidatePath("/settings")

  // If username changed, redirect to new URL
  if (usernameChanged && newUsername) {
    redirect(`/u/${newUsername}`)
  }

  return { success: true }
}
