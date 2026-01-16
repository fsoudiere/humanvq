"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Bot, GraduationCap, Footprints, Calendar, Linkedin, LogOut, Settings, Plus } from "lucide-react"
import ResourceIcon from "@/components/resource-icon"
import { createClient } from "@/utils/supabase/client"
import StackManager from "@/components/stack-manager"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { IntakeForm } from "@/components/IntakeForm"
import { EditablePathTitle } from "@/components/editable-path-title"
import { DeletePathButton } from "@/components/delete-path-button"
import { SharePathButton } from "@/components/share-path-button"
import { Trash2 } from "lucide-react"

// Define the shape of a delegate task item (for delegate_to_machine)
interface DelegateTaskItem {
  task: string
  is_completed: boolean
  is_automated?: boolean  // Optional - kept for n8n data but not used in UI logic
}

// Define the shape of an immediate step item
interface ImmediateStepItem {
  text: string
  is_completed: boolean
}

// Union type for task items
type TaskItem = DelegateTaskItem | ImmediateStepItem

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
    delegate_to_machine?: DelegateTaskItem[]
    keep_for_human?: string[]
  }
  // Now these are Arrays of items!
  ai_tools?: ResourceItem[] 
  human_courses?: ResourceItem[]
  immediate_steps?: ImmediateStepItem[]
  hvq_score?: number
}

type AppState = "loading" | "analyzing" | "results" | "error"

// Animated score badge component
function ScoreBadge({ points }: { points: number }) {
  const [displayPoints, setDisplayPoints] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    setIsAnimating(true)
    const targetPoints = points
    const duration = 600
    const steps = 20
    const increment = targetPoints / steps
    let currentStep = 0

    const interval = setInterval(() => {
      currentStep++
      if (currentStep <= steps) {
        setDisplayPoints(Math.min(Math.round(increment * currentStep), targetPoints))
      } else {
        setDisplayPoints(targetPoints)
        clearInterval(interval)
        setTimeout(() => setIsAnimating(false), 200)
      }
    }, duration / steps)

    return () => clearInterval(interval)
  }, [points])

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full transition-all ${
      isAnimating ? 'scale-110' : 'scale-100'
    }`}>
      <span className="text-sm">+</span>
      <span>{displayPoints}</span>
    </span>
  )
}

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
  
  // Strategy data from upgrade_paths
  const [strategyData, setStrategyData] = useState<{
    role: string | null
    main_goal: string | null
    context: string | null
  }>({
    role: null,
    main_goal: null,
    context: null
  })
  
  // Path metadata
  const [pathTitle, setPathTitle] = useState<string>("")
  const [currentHvqScore, setCurrentHvqScore] = useState<number | null>(null)
  const [isPublic, setIsPublic] = useState<boolean>(false)
  
  // Edit Strategy Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // Calculate HVQ score based on current state
  const calculateHVQScore = (data: UpgradePathData): number => {
    const BASE_SCORE = 100
    
    // Count completed immediate steps (+15 each)
    const completedSteps = (data.immediate_steps || []).filter(
      (step) => step.is_completed
    ).length
    const stepPoints = completedSteps * 15
    
    // Count completed delegate tasks (+10 each)
    const completedDelegateTasks = (data.efficiency_audit?.delegate_to_machine || []).filter(
      (task) => task.is_completed
    ).length
    const delegatePoints = completedDelegateTasks * 10
    
    return BASE_SCORE + stepPoints + delegatePoints
  }

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

      // Store strategy data from upgrade_paths
      setStrategyData({
        role: upgradePath.role || null,
        main_goal: upgradePath.main_goal || null,
        context: upgradePath.context || null
      })

      // Store path metadata
      setPathTitle(upgradePath.path_title || upgradePath.main_goal || "Untitled Path")
      setCurrentHvqScore(upgradePath.current_hvq_score || upgradePath.hvq_score || null)
      setIsPublic(upgradePath.is_public || false)

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

          const immediateSteps = typeof upgradePath.immediate_steps === 'string'
              ? JSON.parse(upgradePath.immediate_steps)
              : upgradePath.immediate_steps;

          const pathData = {
              efficiency_audit: efficiency,
              ai_tools: aiTools,
              human_courses: humanCourses,
              immediate_steps: immediateSteps,
              hvq_score: upgradePath.hvq_score || null
          }

          // Calculate score if not set
          const hvqScore = pathData.hvq_score ?? calculateHVQScore(pathData)

          setUpgradeData({
              ...pathData,
              hvq_score: hvqScore
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
        
        // Update strategy data if available
        if (upgradePath.role || upgradePath.main_goal || upgradePath.context) {
          setStrategyData({
            role: upgradePath.role || null,
            main_goal: upgradePath.main_goal || null,
            context: upgradePath.context || null
          })
        }

        // Update path metadata
        setPathTitle(upgradePath.path_title || upgradePath.main_goal || "Untitled Path")
        setIsPublic(upgradePath.is_public || false)
        
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

          const immediateSteps = typeof upgradePath.immediate_steps === 'string'
              ? JSON.parse(upgradePath.immediate_steps)
              : upgradePath.immediate_steps;

          const pathData = {
              efficiency_audit: efficiency,
              ai_tools: aiTools,
              human_courses: humanCourses,
              immediate_steps: immediateSteps,
              hvq_score: upgradePath.hvq_score || null
          }

          // Calculate score if not set
          const hvqScore = pathData.hvq_score ?? calculateHVQScore(pathData)

          // Update current HVQ score in state
          setCurrentHvqScore(upgradePath.current_hvq_score || hvqScore)

          setUpgradeData({
              ...pathData,
              hvq_score: hvqScore
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

  const handleNewPath = () => {
    // Clear any analyzing or loading states by stopping polling
    setIsPolling(false)
    setState("results") // Set to a stable state before redirect
    setUpgradeData(null)
    setErrorMessage(null)
    
    // Redirect to create page to start a new path
    router.push(`/stack/${userId}/create`)
  }
  
  const handleStrategyUpdate = async (updatedPathId?: string) => {
    // Refresh strategy data after update
    if (pathId) {
      const supabase = createClient()
      const { data: updatedPath } = await supabase
        .from("upgrade_paths")
        .select("role, main_goal, context")
        .eq("id", pathId)
        .maybeSingle()
      
      if (updatedPath) {
        setStrategyData({
          role: updatedPath.role || null,
          main_goal: updatedPath.main_goal || null,
          context: updatedPath.context || null
        })
      }
    }
    setEditDialogOpen(false)
  }

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
  const immediateSteps = upgradeData?.immediate_steps || []

  // Unified function to update Supabase with path data
  const updatePathInSupabase = async (
    updatedData: UpgradePathData
  ) => {
    // Ensure pathId is available
    if (!pathId) {
      console.error("pathId is undefined. Cannot update Supabase.")
      throw new Error("pathId is required for update")
    }

    try {
      const supabase = createClient()

      // Construct the full efficiency_audit object preserving all fields
      // Use updatedData if provided, otherwise fall back to current upgradeData
      const currentEfficiencyAudit = upgradeData?.efficiency_audit || {}
      const updatedEfficiencyAudit = {
        delegate_to_machine: updatedData.efficiency_audit?.delegate_to_machine ?? currentEfficiencyAudit.delegate_to_machine ?? [],
        keep_for_human: updatedData.efficiency_audit?.keep_for_human ?? currentEfficiencyAudit.keep_for_human ?? []
      }

      const payload = {
        immediate_steps: updatedData.immediate_steps ?? [],
        efficiency_audit: updatedEfficiencyAudit,
        hvq_score: updatedData.hvq_score ?? calculateHVQScore(updatedData),
        updated_at: new Date().toISOString()
      }

      console.log("Updating path:", pathId, "with payload:", payload)
      console.log("Payload JSON:", JSON.stringify(payload, null, 2))

      const { data, error } = await supabase
        .from("upgrade_paths")
        .update(payload)
        .eq("id", pathId)
        .select()
    
      if (error) {
        console.error("SUPABASE ERROR:", error.message, "Details:", error.details, "Hint:", error.hint, "Code:", error.code)
        throw error
      }
    
      console.log("✅ Update Success:", data)
      return data
    } catch (error) {
      console.error("Failed to update path data:", error)
      throw error
    }
  }

  // Handle toggle for delegate_to_machine tasks
  const handleToggleDelegate = async (index: number) => {
    if (!upgradeData?.efficiency_audit?.delegate_to_machine) return
    
    // Store previous state for potential revert
    const previousData = upgradeData
    
    // Calculate updated values before state update
    const updatedDelegateList = upgradeData.efficiency_audit.delegate_to_machine.map((item, i) =>
      i === index ? { ...item, is_completed: !item.is_completed } : item
    )
    
    // Construct the full efficiency_audit object preserving keep_for_human
    const updatedEfficiencyAudit = {
      ...upgradeData.efficiency_audit,
      delegate_to_machine: updatedDelegateList
    }
    
    const updatedData = {
      ...upgradeData,
      efficiency_audit: updatedEfficiencyAudit
    }
    
    const newScore = calculateHVQScore(updatedData)
    
    // Optimistically update local state
    setUpgradeData({
      ...updatedData,
      hvq_score: newScore
    })
    
    // Update score in header
    setCurrentHvqScore(newScore)
    
    // Update Supabase in the background
    try {
      await updatePathInSupabase({
        ...updatedData,
        hvq_score: newScore
      })
    } catch (error) {
      // Revert on error
      console.error("Failed to update delegate task, reverting:", error)
      setUpgradeData(previousData)
    }
  }

  // Handle toggle for immediate_steps tasks
  const handleToggleStep = async (index: number) => {
    if (!upgradeData?.immediate_steps) return
    
    // Store previous state for potential revert
    const previousData = upgradeData
    
    // Calculate updated values before state update
    const updatedSteps = upgradeData.immediate_steps.map((step, i) =>
      i === index ? { ...step, is_completed: !step.is_completed } : step
    )
    
    const updatedData = {
      ...upgradeData,
      immediate_steps: updatedSteps
    }
    
    const newScore = calculateHVQScore(updatedData)
    
    // Optimistically update local state
    setUpgradeData({
      ...updatedData,
      hvq_score: newScore
    })
    
    // Update score in header
    setCurrentHvqScore(newScore)
    
    // Update Supabase in the background
    try {
      await updatePathInSupabase({
        ...updatedData,
        hvq_score: newScore
      })
    } catch (error) {
      // Revert on error
      console.error("Failed to update immediate step, reverting:", error)
      setUpgradeData(previousData)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-16">
        
        {/* Premium Header Section */}
        <div className="mb-12 pb-8 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Left: Title and Score */}
            <div className="flex-1">
              <EditablePathTitle 
                pathId={pathId}
                initialTitle={pathTitle}
                onUpdate={(newTitle) => setPathTitle(newTitle)}
              />
              
              {/* HVQ Score Badge */}
              {currentHvqScore !== null && (
                <div className="mt-4 flex items-center gap-3">
                  <div className={`inline-flex items-center justify-center px-4 py-2 rounded-xl font-bold text-2xl shadow-sm border-2 ${
                    currentHvqScore < 120
                      ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
                      : currentHvqScore >= 120 && currentHvqScore <= 150
                      ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                  }`}>
                    <span className="text-sm mr-1">HVQ</span>
                    <span>{currentHvqScore}</span>
                  </div>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {currentHvqScore < 120 
                      ? "Manual/Low Leverage" 
                      : currentHvqScore >= 120 && currentHvqScore <= 150
                      ? "Optimizing"
                      : "High Leverage"}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Action Buttons */}
            <div className="flex gap-2">
              {/* Share Button */}
              <SharePathButton pathId={pathId} initialIsPublic={isPublic} />
              
              {/* Edit Strategy Button */}
              <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Edit Strategy
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Strategy</DialogTitle>
                    <DialogDescription>
                      Update your role, goal, and context for this path.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <IntakeForm
                      pathId={pathId}
                      initialData={{
                        role: strategyData.role,
                        main_goal: strategyData.main_goal,
                        context: strategyData.context
                      }}
                      onSuccess={handleStrategyUpdate}
                      showCard={false}
                    />
                  </div>
                </DialogContent>
              </Dialog>
              
              {/* Delete Path Button */}
              <DeletePathButton pathId={pathId} />
            </div>
          </div>
        </div>
        
        {/* Legacy Action Buttons */}
        <div className="mb-8 flex justify-end gap-2">
          {/* New Path Button */}
          <Button
            onClick={handleNewPath}
            variant="ghost"
            size="sm"
            className="gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <Plus className="h-4 w-4" />
            New Path
          </Button>
          
          {/* Logout Button */}
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
                      <li key={index} className="flex items-start gap-3">
                        <Checkbox
                          checked={item.is_completed}
                          onCheckedChange={() => handleToggleDelegate(index)}
                          className="mt-0.5"
                        />
                        <label
                          className={`flex-1 cursor-pointer ${
                            item.is_completed 
                              ? "text-zinc-500 dark:text-zinc-500" 
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}
                          onClick={() => handleToggleDelegate(index)}
                        >
                          {item.task}
                        </label>
                        {item.is_completed && (
                          <ScoreBadge points={10} />
                        )}
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
                  {tool.id && tool.id !== 'null' && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                      <StackManager resourceId={tool.id} />
                    </div>
                  )}
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
            {immediateSteps.length > 0 ? (
              immediateSteps.map((step, i) => (
                <Card key={i} className="border-l-4 border-l-emerald-500 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <CardContent className="flex items-start gap-4 p-6">
                    <Checkbox
                      checked={step.is_completed}
                      onCheckedChange={() => handleToggleStep(i)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          {i + 1}
                        </div>
                       <p
                        className={`text-lg ${
                          step.is_completed 
                            ? "line-through text-zinc-500 dark:text-zinc-500" 
                            : "text-zinc-700 dark:text-zinc-300"
                        } cursor-pointer`}
                        onClick={() => handleToggleStep(i)}
                      >
                        {step.text}
                      </p>
                      </div>
                    </div>
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
