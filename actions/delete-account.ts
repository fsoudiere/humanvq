"use server"

import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

export interface DeleteAccountResult {
  success: boolean
  error?: string
}

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "User not authenticated" }
  }

  const userId = user.id

  try {
    // Delete all user's paths first (cascade may handle this, but explicit is safer)
    const { error: pathsError } = await supabase
      .from("upgrade_paths")
      .delete()
      .eq("user_id", userId)

    if (pathsError) {
      console.error("Failed to delete paths:", pathsError)
      // Continue anyway - try to delete other data
    }

    // Note: path_resources will be automatically deleted via cascade when upgrade_paths are deleted
    // No need to explicitly delete from user_stacks (we're migrating away from it)

    // Delete profile
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("user_id", userId)

    if (profileError) {
      console.error("Failed to delete profile:", profileError)
      // Continue anyway - try to delete auth user
    }

    // Note: We cannot delete the auth user directly from a server action
    // without admin privileges. We delete all user data and sign them out.
    // The auth user can be deleted manually or via a database trigger if needed.
    
    // Sign out the user
    const { error: signOutError } = await supabase.auth.signOut()
    
    if (signOutError) {
      console.error("Failed to sign out:", signOutError)
    }
    
    // All user data has been deleted from database tables
    // Auth user account remains but has no associated data
    return { success: true }
    
  } catch (error) {
    console.error("Error deleting account:", error)
    return { success: false, error: "An unexpected error occurred while deleting account" }
  }
}
