"use client"

import { useState, useEffect } from "react"
import {
  Bot,
  GraduationCap,
  Footprints,
  Calendar,
  Linkedin,
  RotateCcw,
  LogOut,
} from "lucide-react"
import ResourceVote from "@/components/resource-vote"
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
import { createClient } from "@/utils/supabase/client"
import { IntakeForm } from "@/components/IntakeForm"

type AppState = "auth" | "intake" | "analyzing" | "results"

// Define the shape of a single resource
interface ResourceItem {
  id?: string;
  userId?: string;
  title: string
  description: string
  url?: string // Optional link
}

interface PowerPackItem {
  name: string
  description: string
  icon: string
}

interface UpgradePathData {
  efficiency_audit?: {
    delegate_to_machine?: string[]
    keep_for_human?: string[]
  }
  // Now these are Arrays of items!
  ai_tools?: ResourceItem[] 
  human_courses?: ResourceItem[]
  immediate_steps?: string[]
}

export default function Home() {
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
  const [upgradeData, setUpgradeData] = useState<UpgradePathData | null>(null)
  const [isPolling, setIsPolling] = useState(false)

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

      // Check if upgrade_paths exists
      const { data: upgradePath, error: upgradeError } = await supabase
        .from("upgrade_paths")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle()

      if (upgradeError || !upgradePath) {
        setState("analyzing")
        return
      }

      // Parse and display results
      try {
        setUpgradeData({
          efficiency_audit: upgradePath.efficiency_audit, // Assuming JSON structure is flat now
          ai_tools: upgradePath.ai_tools,
          human_courses: upgradePath.human_courses,
          immediate_steps: upgradePath.immediate_steps
      })
        setState("results")
      } catch (error) {
        console.error("Error parsing upgrade path data:", error)
        setState("analyzing")
      }
    }

    checkStatus()
  }, [])

// Poll for upgrade_paths when in analyzing state
// Poll for upgrade_paths when in analyzing state
useEffect(() => {
  if (state !== "analyzing") {
    setIsPolling(false)
    return
  }

  setIsPolling(true)
  let pollCount = 0
  const maxPolls = 20 // 60 seconds timeout

  console.log("🚀 Starting Polling Sequence...")

  const pollUpgradePath = async () => {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      console.log("❌ No session found, stopping poll.")
      setIsPolling(false)
      return
    }

    pollCount++
    console.log(`📡 Polling Attempt ${pollCount}/${maxPolls}...`)

    // NOTE: Changed .single() to .maybeSingle() to prevent 406 errors when row is missing
    const { data: upgradePath, error } = await supabase
      .from("upgrade_paths")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() 

    // 🔍 DEBUG LOG: Show exactly what Supabase returned
    console.log("🔍 Supabase Response:", { 
      foundRow: !!upgradePath, 
      hasAudit: !!upgradePath?.efficiency_audit, 
      error: error?.message 
    })

    // ... inside the pollUpgradePath function ...

    if (!error && upgradePath && upgradePath.efficiency_audit) {
      console.log("✅ Success! Payload received. Switching to Results.")
      
      try {
          // 1. Safe JSON Parse for Efficiency Audit
          const efficiency = typeof upgradePath.efficiency_audit === 'string' 
              ? JSON.parse(upgradePath.efficiency_audit) 
              : upgradePath.efficiency_audit;
          
          // 2. Safe JSON Parse for AI Tools (New Array Structure)
          const aiTools = typeof upgradePath.ai_tools === 'string'
              ? JSON.parse(upgradePath.ai_tools)
              : upgradePath.ai_tools;

          // 3. Safe JSON Parse for Human Courses (New Array Structure)
          const humanCourses = typeof upgradePath.human_courses === 'string'
              ? JSON.parse(upgradePath.human_courses)
              : upgradePath.human_courses;

          // 4. Update State with the NEW structure
          setUpgradeData({
              efficiency_audit: efficiency,
              ai_tools: aiTools,           // <--- Mapped correctly
              human_courses: humanCourses, // <--- Mapped correctly
              immediate_steps: upgradePath.immediate_steps
          })
          
          setState("results")
          setIsPolling(false)
      } catch (e) {
          console.error("❌ Error parsing JSON:", e)
      }

    } else if (pollCount >= maxPolls) {
      console.warn("⚠️ Polling timeout: No data after 60s")
      setIsPolling(false)
    } else {
      console.log("⏳ Data not ready yet. Waiting 3s...")
    }
  }

  // Run immediately, then interval
  pollUpgradePath()
  const interval = setInterval(pollUpgradePath, 3000)

  return () => {
    console.log("🛑 Polling stopped (cleanup).")
    clearInterval(interval)
    setIsPolling(false)
  }
}, [state])
        

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
        setUpgradeData(null)
        setIsPolling(false)
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
          <IntakeForm onSuccess={() => setState("analyzing")} />
        </main>
      </div>
    )
  }

  // Analyzing State - Polling for results
  if (state === "analyzing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:0ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]"></div>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Analyzing Human Moat...
          </p>
        </div>
      </div>
    )
  }

  // Results State - Display upgrade path data
  const delegateToMachine = upgradeData?.efficiency_audit?.delegate_to_machine || []
  const keepForHuman = upgradeData?.efficiency_audit?.keep_for_human || []
  //const powerPack = upgradeData?.power_pack

  // Default fallback icons
  const getIcon = (iconName?: string) => {
    switch (iconName?.toLowerCase()) {
      case "bot":
      case "tool":
        return Bot
      case "graduationcap":
      case "course":
        return GraduationCap
      case "footprints":
      case "step":
        return Footprints
      default:
        return Bot
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-16">
      
        
        {/* Logout Button */}
        <div className="mb-8 flex justify-end">
        <Button
            onClick={() => setState("intake")} // <--- This switches view back to empty form
            variant="ghost"
            size="sm"
            className="gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <RotateCcw className="h-4 w-4" />
            Start Over
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>

        {/* The Efficiency Audit */}
        <section className="mb-20">
          <h2 className="mb-8 text-3xl font-light tracking-tight text-black dark:text-zinc-50">
            The Efficiency Audit
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Delegate to Machine */}
            <Card className="border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-red-900 dark:text-red-400">
                  Delegate to Machine
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-zinc-700 dark:text-zinc-300">
                  {delegateToMachine.length > 0 ? (
                    delegateToMachine.map((item, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <span className="text-red-600 dark:text-red-400">•</span>
                        {item}
                      </li>
                    ))
                  ) : (
                    <li className="text-zinc-500">No items to delegate</li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {/* Right: Keep for Human */}
            <Card className="border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-green-900 dark:text-green-400">
                  Keep for Human
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {keepForHuman.length > 0 ? (
                    keepForHuman.map((item, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <span className="text-green-600 dark:text-green-400">•</span>
                        {item}
                      </li>
                    ))
                  ) : (
                    <li className="text-zinc-500">No items to keep</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* The Power Pack */}
        {/* === SECTION 1: TOP 3 AI TOOLS === */}
        <section className="mb-16">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-3xl font-light tracking-tight text-black dark:text-zinc-50">
              Top 3 AI Tools
            </h2>
          </div>
          
          <div className="grid gap-6 md:grid-cols-3">
            {upgradeData?.ai_tools?.map((tool, i) => (
              <Card key={i} className="group transition-all hover:border-blue-200 hover:shadow-md dark:hover:border-blue-800">
                <CardHeader>
                  <CardTitle className="text-lg">{tool.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    {tool.description}
                  </p>
                  {tool.url && (
                    <a href={tool.url} target="_blank" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                      View Tool →
                    </a>
                  )}
                  {userId && ( <ResourceVote  userId={userId}  url={tool.url}  /> )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* === SECTION 2: TOP 3 HUMAN COURSES === */}
        <section className="mb-20">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <GraduationCap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-3xl font-light tracking-tight text-black dark:text-zinc-50">
              Top 3 Human Skills Courses
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {upgradeData?.human_courses?.map((course, i) => (
              <Card key={i} className="group transition-all hover:border-purple-200 hover:shadow-md dark:hover:border-purple-800">
                <CardHeader>
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                </CardHeader>
                <CardContent>
                   <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    {course.description}
                  </p>
                  {course.url && (
                    <a href={course.url} target="_blank" className="text-xs font-medium text-purple-600 hover:underline dark:text-purple-400">
                      View Course →
                    </a>
                  )}
                  {userId && ( <ResourceVote  userId={userId}  url={course.url}  /> )}
                  </CardContent>
              </Card>
            ))}
          </div>
        </section>
        {/* === SECTION 3: IMMEDIATE NEXT STEPS === */}
        <section className="mb-20">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <Footprints className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-3xl font-light tracking-tight text-black dark:text-zinc-50">
              Your Immediate Action Plan
            </h2>
          </div>

          <div className="grid gap-4">
            {upgradeData?.immediate_steps?.length ? (
              upgradeData.immediate_steps.map((step, i) => (
                <Card key={i} className="border-l-4 border-l-emerald-500 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <CardContent className="flex items-center gap-4 p-6">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      {i + 1}
                    </div>
                    <p className="text-lg text-zinc-700 dark:text-zinc-300">
                      {step}
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center text-zinc-500">
                No immediate steps generated.
              </div>
            )}
          </div>
        </section>

        {/* Accountability Bridge */}
        <section>
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-2xl font-light tracking-tight">
                Accountability Bridge
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="text-zinc-600 dark:text-zinc-400">
                Set a check-in reminder to track your progress on your Human+
                journey.
              </p>
              <Button onClick={handleCheckIn} size="lg" className="gap-2">
                <Calendar className="h-4 w-4" />
                Check-in
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
