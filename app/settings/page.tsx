"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { createClient } from "@/utils/supabase/client"
import { updateProfile } from "@/actions/update-profile"
import { deleteAccount } from "@/actions/delete-account"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Trash2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface ProfileFormData {
  full_name: string
  username: string
  is_organization: boolean
  organization_name: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [originalUsername, setOriginalUsername] = useState<string | null>(null)

  const form = useForm<ProfileFormData>({
    defaultValues: {
      full_name: "",
      username: "",
      is_organization: false,
      organization_name: "",
    },
  })

  const isOrganization = form.watch("is_organization")

  // Fetch current profile data
  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/")
        return
      }

      setUserId(user.id)

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, username, is_organization, organization_name")
        .eq("user_id", user.id)
        .maybeSingle()

      if (profileError) {
        console.error("Error fetching profile:", profileError)
        setError("Failed to load profile")
      } else if (profile) {
        const username = profile.username || ""
        setOriginalUsername(username)
        form.reset({
          full_name: profile.full_name || "",
          username: username,
          is_organization: profile.is_organization || false,
          organization_name: profile.organization_name || "",
        })
      }

      setLoading(false)
    }

    fetchProfile()
  }, [router, form])

  const onSubmit = async (data: ProfileFormData) => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    // Check if username is changing to show optimistic success message
    const newUsername = data.username.trim()
    const usernameChanged = newUsername && newUsername !== originalUsername

    try {
      // Show optimistic success message if username is changing
      // (redirect will happen server-side, but this gives user feedback)
      if (usernameChanged) {
        setSuccess("Profile updated successfully! Redirecting...")
      }

      const result = await updateProfile({
        full_name: data.full_name.trim() || undefined,
        username: newUsername || undefined,
        is_organization: data.is_organization,
        organization_name: data.is_organization ? (data.organization_name.trim() || null) : null,
      })

      if (!result.success) {
        setError(result.error || "Failed to update profile")
        setSaving(false)
        setSuccess(null) // Clear optimistic success message on error
      } else {
        // If no redirect happened (username didn't change), show success message
        if (!usernameChanged) {
          setSuccess("Profile updated successfully!")
          setTimeout(() => setSuccess(null), 3000)
          setSaving(false)
        }
        // If username changed, redirect() was called server-side
        // The success message is already shown optimistically
      }
    } catch (err: any) {
      // Next.js redirect() throws a NEXT_REDIRECT error which is expected
      // If it's a redirect, let it happen; otherwise show error
      if (err?.digest?.startsWith("NEXT_REDIRECT")) {
        // This is expected - redirect is happening
        return
      }
      console.error("Error updating profile:", err)
      setError("An unexpected error occurred")
      setSaving(false)
      setSuccess(null) // Clear optimistic success message on error
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account? This action cannot be undone and will permanently delete all your data, including paths and stack items.")) {
      return
    }

    // Double confirmation
    const confirmed = prompt(
      "This is irreversible. Type 'DELETE' to confirm account deletion:"
    )
    
    if (confirmed !== "DELETE") {
      return
    }

    setDeleting(true)
    setError(null)

    try {
      const result = await deleteAccount()
      if (result.success) {
        router.push("/")
        router.refresh()
      } else {
        setError(result.error || "Failed to delete account")
        setDeleting(false)
      }
    } catch (err) {
      console.error("Error deleting account:", err)
      setError("An unexpected error occurred while deleting account")
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-600 dark:text-zinc-400">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-6 py-16">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-normal text-zinc-900 dark:text-zinc-50">
            Settings
          </h1>
        </div>

        {/* Profile Settings Card */}
        <Card className="mb-8 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your name and username
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John Doe"
                          {...field}
                          disabled={saving}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="johndoe"
                          {...field}
                          disabled={saving}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Organization Toggle */}
                <FormField
                  control={form.control}
                  name="is_organization"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Organization Account
                        </FormLabel>
                        <div className="text-sm text-zinc-600 dark:text-zinc-400">
                          Enable if this account represents an organization
                        </div>
                      </div>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={saving}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Organization Name - Only show if is_organization is true */}
                {isOrganization && (
                  <FormField
                    control={form.control}
                    name="organization_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Acme Corporation"
                            {...field}
                            disabled={saving}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Success Message */}
                {success && (
                  <div className="rounded-md bg-green-50 p-3 text-sm text-green-600 dark:bg-green-950/20 dark:text-green-400">
                    {success}
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Danger Zone Card */}
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                  Delete Account
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                  Once you delete your account, there is no going back. All your data, including paths, stack items, and preferences will be permanently deleted.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Deleting..." : "Delete Account"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
