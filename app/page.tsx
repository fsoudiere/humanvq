"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Linkedin } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { IntakeForm } from "@/components/IntakeForm"
import { getUserDestination } from "@/actions/profiles"

type AppState = "auth" | "intake"

export default function Home() {
  const router = useRouter()
  const [state, setState] = useState<AppState>("auth")
  const [userId, setUserId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup")
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authData, setAuthData] = useState({
    email: "",
    password: "",
  })
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    type: "",
  })
  // Check session and profile status
  useEffect(() => {
    const checkStatus = async () => {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setState("auth")
        return
      }
      setUserId(session.user.id)
      
      // Check if profile exists
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle()

      if (profileError || !profile) {
        setState("intake")
        return
      }

      // Use the helper function to determine redirect destination
      // Priority: /u/[username] > /u/[userId] > /settings
      const destination = await getUserDestination()
      
      if (destination) {
        router.push(destination)
        return
      }
      
      // Fallback to unified route with userId if helper returns null
      router.push(`/u/${session.user.id}`)
      return
    }

    checkStatus()
  }, [router])

  // Remove polling logic - it's now handled in the path page
        

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    try {
      const supabase = createClient()

      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authData.email,
          password: authData.password,
        })

        if (error) {
          setAuthError(error.message)
          setAuthLoading(false)
          return
        }

        if (data.user) {
          setAuthLoading(false)
          setState("intake")
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authData.email,
          password: authData.password,
        })

        if (error) {
          setAuthError(error.message)
          setAuthLoading(false)
          return
        }

        if (data.session) {
          setAuthLoading(false)
          // Check status will be triggered by useEffect
          window.location.reload()
        }
      }
    } catch (error) {
      console.error("Error authenticating:", error)
      setAuthError("An unexpected error occurred. Please try again.")
      setAuthLoading(false)
    }
  }

  const handleLinkedinLogin = async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc', // The modern OpenID Connect standard
      options: {
        redirectTo: `${window.location.origin}`, // Returns user to this page after login
      },
    })

    if (error) {
      console.error("LinkedIn Login Error:", error)
      setAuthError(error.message)
    }
  }
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Form submitted:", formData)
    setFormData({ name: "", url: "", type: "" })
    setDialogOpen(false)
  }

  const handleCheckIn = () => {
    alert("Check-in reminder set!")
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("Error signing out:", error)
      } else {
        setState("auth")
        setAuthData({ email: "", password: "" })
        setAuthError(null)
      }
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  // Auth State - Login/Signup
  if (state === "auth") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-20 text-center">
          <h1 className="text-5xl font-light leading-tight tracking-tight text-black dark:text-zinc-50">
            The world changed. Let's upgrade you to match it.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Discover your Human+ score and the AI tools that specifically
            support your unique profile.
          </p>
          <div className="w-full max-w-md pt-4">
            <Card className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <CardHeader>
                <CardTitle className="text-xl">
                  {authMode === "signup" ? "Create Account" : "Sign In"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAuth} className="space-y-4">
                  {/* LinkedIn OAuth Button */}
                  <Button
                    type="button" // Important: preventing it from submitting the form
                    variant="outline"
                    className="w-full gap-2 border-blue-700/20 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-950/50"
                    onClick={handleLinkedinLogin}
                  >
                    <Linkedin className="h-4 w-4" />
                    {authMode === "signup" ? "Sign up with LinkedIn" : "Sign in with LinkedIn"}
                  </Button>

                  {/* The Divider */}
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-zinc-500 dark:bg-zinc-900">
                        Or continue with email
                      </span>
                    </div>
                  </div>

                  {/* Existing Email Input (Don't change anything below here) */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={authData.email}
                      onChange={(e) =>
                        setAuthData({ ...authData, email: e.target.value })
                      }
                      placeholder="you@example.com"
                      required
                      disabled={authLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={authData.password}
                      onChange={(e) =>
                        setAuthData({ ...authData, password: e.target.value })
                      }
                      placeholder="••••••••"
                      required
                      disabled={authLoading}
                      minLength={6}
                    />
                  </div>
                  {authError && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
                      {authError}
                    </div>
                  )}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={authLoading}
                  >
                    {authLoading
                      ? "Processing..."
                      : authMode === "signup"
                        ? "Create Account"
                        : "Sign In"}
                  </Button>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode(authMode === "signup" ? "signin" : "signup")
                        setAuthError(null)
                      }}
                      className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      {authMode === "signup"
                        ? "Already have an account? Sign in"
                        : "Don't have an account? Sign up"}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200">
                Suggest an App/Course
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Suggest an App/Course</DialogTitle>
                <DialogDescription>
                  Share a resource that could help professionals in the AI age.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Resource name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={formData.url}
                    onChange={(e) =>
                      setFormData({ ...formData, url: e.target.value })
                    }
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Input
                    id="type"
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value })
                    }
                    placeholder="App, Course, Tool, etc."
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Submit</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    )
  }

  // Intake State - Show IntakeForm
  if (state === "intake") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-20">
          <div className="text-center">
            <h1 className="text-5xl font-light leading-tight tracking-tight text-black dark:text-zinc-50">
              The world changed. Let's upgrade you to match it.
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
              Discover your Human+ score and the AI tools that specifically
              support your unique profile.
            </p>
          </div>
          <IntakeForm onSuccess={() => {
            // After intake form submission, redirect will be handled by the checkStatus useEffect
            // which will run when the page reloads or session updates
            window.location.reload()
          }} />
        </main>
      </div>
    )
  }

  // Results state is now handled by the path page - this code should never be reached
  return null
}
