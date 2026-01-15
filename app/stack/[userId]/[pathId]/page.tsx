"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Bot, GraduationCap, Footprints, Calendar, Linkedin, RotateCcw, LogOut } from "lucide-react"
import ResourceIcon from "@/components/resource-icon"
import { createClient } from "@/utils/supabase/client"
import ResourceVote from "@/components/resource-vote"
import StackManager from "@/components/stack-manager"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Define the shape of a single resource
interface ResourceItem {
  id?: string;
  userId?: string;
  title: string
  description: string
  logo_url?: string
  url?: string // Optional link
  capabilities?: string[]; 
  difficulty_level?: number;
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

type AppState = "loading" | "analyzing" | "results" | "error"

export default function PathPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string
  const pathId = params.pathId as string
  
  const [state, setState] = useState<AppState>("loading")
  const [upgradeData, setUpgradeData] = useState<UpgradePathData | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [resourceLogos, setResourceLogos] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const fetchLogos = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("resources").select("id, logo_url")
      if (data) {
        const logoMap = data.reduce((acc, curr) => {
          if (curr.logo_url) acc[curr.id] = curr.logo_url
          return acc
        }, {} as Record<string, string>)
        setResourceLogos(logoMap)
      }
    }
    fetchLogos()
  }, [])

  // Check if upgrade_path exists by pathId
  useEffect(() => {
    const checkPathStatus = async () => {
      const supabase = createClient()
      
      // Verify user is authenticated and matches userId
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push("/")
        return
      }

      // Fetch the specific path by ID
      const { data: upgradePath, error: upgradeError } = await supabase
        .from("upgrade_paths")
        .select("*")
        .eq("id", pathId)
        .maybeSingle()

      if (upgradeError) {
        console.error("Error fetching path:", upgradeError)
        setState("error")
        setErrorMessage("Path not found")
        return
      }

      if (!upgradePath) {
        setState("analyzing")
        setIsPolling(true)
        return
      }

      // Check if path is ready (has efficiency_audit)
      if (upgradePath.efficiency_audit) {
        try {
          // Safe JSON Parse
          const efficiency = typeof upgradePath.efficiency_audit === 'string' 
              ? JSON.parse(upgradePath.efficiency_audit) 
              : upgradePath.efficiency_audit;
          
          const aiTools = typeof upgradePath.ai_tools === 'string'
              ? JSON.parse(upgradePath.ai_tools)
              : upgradePath.ai_tools;

          const humanCourses = typeof upgradePath.human_courses === 'string'
              ? JSON.parse(upgradePath.human_courses)
              : upgradePath.human_courses;

          setUpgradeData({
              efficiency_audit: efficiency,
              ai_tools: aiTools,
              human_courses: humanCourses,
              immediate_steps: upgradePath.immediate_steps
          })
          
          setState("results")
          setIsPolling(false)
        } catch (error) {
          console.error("Error parsing upgrade path data:", error)
          setState("analyzing")
          setIsPolling(true)
        }
      } else {
        setState("analyzing")
        setIsPolling(true)
      }
    }

    checkPathStatus()
  }, [pathId, router])

  // Poll for upgrade_paths when in analyzing state
  useEffect(() => {
    if (state !== "analyzing" || !isPolling) {
      return
    }

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

      const { data: upgradePath, error } = await supabase
        .from("upgrade_paths")
        .select("*")
        .eq("id", pathId)
        .maybeSingle() 

      console.log("🔍 Supabase Response:", { 
        foundRow: !!upgradePath, 
        hasAudit: !!upgradePath?.efficiency_audit, 
        error: error?.message 
      })

      if (!error && upgradePath && upgradePath.efficiency_audit) {
        console.log("✅ Success! Payload received. Switching to Results.")
        
        try {
          const efficiency = typeof upgradePath.efficiency_audit === 'string' 
              ? JSON.parse(upgradePath.efficiency_audit) 
              : upgradePath.efficiency_audit;
          
          const aiTools = typeof upgradePath.ai_tools === 'string'
              ? JSON.parse(upgradePath.ai_tools)
              : upgradePath.ai_tools;

          const humanCourses = typeof upgradePath.human_courses === 'string'
              ? JSON.parse(upgradePath.human_courses)
              : upgradePath.human_courses;

          setUpgradeData({
              efficiency_audit: efficiency,
              ai_tools: aiTools,
              human_courses: humanCourses,
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
        setState("error")
        setErrorMessage("Path generation timed out. Please try again.")
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
  }, [state, isPolling, pathId])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("Error signing out:", error)
      } else {
        router.push("/")
      }
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  // Loading State
  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:0ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]"></div>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Loading path...
          </p>
        </div>
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

  // Error State
  if (state === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <p className="text-lg text-red-600 dark:text-red-400">
            {errorMessage || "An error occurred"}
          </p>
          <Button onClick={() => router.push("/")}>
            Go Home
          </Button>
        </div>
      </div>
    )
  }

  // Results State - Display upgrade path data
  const delegateToMachine = upgradeData?.efficiency_audit?.delegate_to_machine || []
  const keepForHuman = upgradeData?.efficiency_audit?.keep_for_human || []

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-16">
        
        {/* Logout Button */}
        <div className="mb-8 flex justify-end gap-2">
          <Button
            onClick={() => router.push("/")}
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
                  <div className="shrink-0 mt-1">
                    <ResourceIcon 
                      logo_url={tool.id ? resourceLogos[tool.id] : undefined}
                      url={tool.url}
                      name={tool.title}
                      className="w-16 h-16 rounded-md object-contain bg-white border border-zinc-100 p-1"
                    />
                  </div>
                  <CardTitle className="text-lg">{tool.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    {tool.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {tool.capabilities && tool.capabilities.slice(0, 3).map((cap: string, i: number) => (
                      <span key={i} className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-1 rounded-sm border border-gray-200">
                        {cap}
                      </span>
                    ))}
                  </div>
                  
                  {tool.url && (
                    <a href={tool.url} target="_blank" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                      View Tool →
                    </a>
                  )}
                  {tool.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                      <StackManager resourceId={tool.id} />
                    </div>
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
                  <div className="shrink-0 mt-1">
                    <ResourceIcon 
                      logo_url={course.id ? resourceLogos[course.id] : undefined}
                      url={course.url}
                      name={course.title}
                      className="w-16 h-16 rounded-md object-contain bg-white border border-zinc-100 p-1"
                    />
                  </div>
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
                  {course.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                      <StackManager resourceId={course.id} isCourse={true} />
                    </div>
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
              <Button onClick={() => alert("Check-in reminder set!")} size="lg" className="gap-2">
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
