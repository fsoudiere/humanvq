"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Bot, GraduationCap, Footprints, Calendar, Settings, LogOut, Target, Plus } from "lucide-react"
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
import AddToolSearch from "@/components/add-tool-search"
import Link from "next/link"
// StackManager now handles all resource management via updateResourceStatus

// Define the shape of a delegate task item
interface DelegateTaskItem {
  task: string
  is_completed: boolean
  is_automated?: boolean
}

interface ImmediateStepItem {
  text: string
  is_completed: boolean
}

interface ResourceItem {
  id?: string
  userId?: string
  title: string
  description: string
  logo_url?: string
  url?: string
  capabilities?: string[]
  difficulty_level?: number
  hvq_score_machine?: number
  hvq_score_human?: number
}

interface UpgradePathData {
  efficiency_audit?: {
    delegate_to_machine?: DelegateTaskItem[]
    keep_for_human?: string[]
  }
  // Note: ai_tools and human_courses are now fetched from path_resources (relational)
  // They are stored in pathResourcesList state, not in this interface
  immediate_steps?: ImmediateStepItem[]
  current_hvq_score?: number
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

export default function UnifiedPathPage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string
  const slug = params.slug as string

  const [state, setState] = useState<AppState>("loading")
  const [upgradeData, setUpgradeData] = useState<UpgradePathData | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [resourceLogos, setResourceLogos] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [pathId, setPathId] = useState<string | null>(null)
  
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
  const [profileData, setProfileData] = useState<{
    user_id: string
    full_name: string | null
    is_organization: boolean
    organization_name: string | null
  } | null>(null)

  // Path-specific tool management
  const [pathResources, setPathResources] = useState<Record<string, string>>({}) // resourceId -> status (added/removed)
  const [pathResourceWeights, setPathResourceWeights] = useState<Record<string, number>>({}) // resourceId -> impact_weight
  const [userStackStatus, setUserStackStatus] = useState<Record<string, string>>({}) // resourceId -> status (paying/free_user/wishlist/etc)
  const [pathResourcesList, setPathResourcesList] = useState<{
    ai_tools: ResourceItem[]
    human_courses: ResourceItem[]
  }>({ ai_tools: [], human_courses: [] })

  // Edit Strategy Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // Calculate HVQ score based on current state
  // Now includes weighted resource leverage based on status
  const calculateHVQScore = (data: UpgradePathData): number => {
    const BASE_SCORE = 100
    
    const completedSteps = (data.immediate_steps || []).filter(
      (step) => step.is_completed
    ).length
    const stepPoints = completedSteps * 15
    
    const completedDelegateTasks = (data.efficiency_audit?.delegate_to_machine || []).filter(
      (task) => task.is_completed
    ).length
    const delegatePoints = completedDelegateTasks * 10
    
    // Calculate resource leverage points using relational data from path_resources
    // Loop through path_resources array and use impact_weight from the database
    let resourcePoints = 0
    if (pathResourcesList.ai_tools || pathResourcesList.human_courses) {
      const allResources = [...(pathResourcesList.ai_tools || []), ...(pathResourcesList.human_courses || [])]
      allResources.forEach((resource) => {
        if (resource.id) {
          // Get impact_weight from path_resources table (stored in pathResourceWeights state)
          const impactWeight = pathResourceWeights[resource.id] || 0
          // Use hvq_score_machine for AI tools, hvq_score_human for courses
          const leverage = resource.hvq_score_machine || resource.hvq_score_human || 0
          // The Math: resourcePoints += (resource.hvq_score_machine || resource.hvq_score_human || 0) * item.impact_weight
          resourcePoints += leverage * impactWeight
        }
      })
    }
    
    return BASE_SCORE + stepPoints + delegatePoints + Math.round(resourcePoints)
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

  // Fetch path by slug and username
  useEffect(() => {
    const fetchPath = async () => {
      const supabase = createClient()
      
      // Get current user for ownership check
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      // STEP 1: Fetch profile by username from URL
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, full_name, username, is_organization, organization_name")
        .eq("username", username)
        .maybeSingle()

      if (!profile) {
        setState("error")
        setErrorMessage(`User with username "${username}" not found`)
        return
      }

      setProfileData({
        user_id: profile.user_id,
        full_name: profile.full_name,
        is_organization: profile.is_organization || false,
        organization_name: profile.organization_name
      })

      // STEP 2: Fetch path with nested path_resources and resources
      // Using explicit column names: hvq_score_machine, hvq_score_human, impact_weight, and current_hvq_score
      // Note: current_hvq_score is persisted after status updates in actions/path-resources.ts
      const { data: path, error: pathError } = await supabase
        .from("upgrade_paths")
        .select(`
          *,
          path_resources (
            status,
            impact_weight,
            resources (
              id,
              name,
              type,
              description,
              url,
              logo_url,
              hvq_score_machine,
              hvq_score_human
            )
          )
        `)
        .eq("slug", slug)
        .eq("user_id", profile.user_id)
        .maybeSingle()

      if (pathError || !path) {
        setState("error")
        setErrorMessage("Path not found")
        return
      }

      setPathId(path.id)
      setIsPublic(path.is_public || false)

      // Check ownership: auth.user.id === path.user_id
      const ownerCheck = user && user.id === path.user_id
      setIsOwner(ownerCheck || false)

      // Process path_resources: filter out removed and separate by type
      if (path.path_resources && Array.isArray(path.path_resources)) {
        // UI Filter: Only render items where status !== 'removed'
        const visiblePathResources = path.path_resources.filter(
          (pr: any) => pr.status !== 'removed'
        )

        // Build status map, weight map, and separate by type
        const pathResourcesMap: Record<string, string> = {}
        const pathResourceWeightsMap: Record<string, number> = {}
        const aiTools: ResourceItem[] = []
        const humanCourses: ResourceItem[] = []

        visiblePathResources.forEach((pr: any) => {
          // Access resources from the nested structure
          const resource = pr.resources
          if (resource && resource.id) {
            pathResourcesMap[resource.id] = pr.status
            // Store impact_weight from path_resources table
            pathResourceWeightsMap[resource.id] = pr.impact_weight || 0

            const resourceItem: ResourceItem = {
              id: resource.id,
              title: resource.name,
              description: resource.description || "",
              url: resource.url,
              logo_url: resource.logo_url,
              hvq_score_machine: resource.hvq_score_machine,
              hvq_score_human: resource.hvq_score_human,
            }

            // Logic Separation: Split by type
            // Tools: item.resources.type === 'ai_tool'
            if (resource.type === "ai_tool") {
              aiTools.push(resourceItem)
            }
            // Courses: item.resources.type === 'human_course'
            else if (resource.type === "human_course") {
              humanCourses.push(resourceItem)
            }
          }
        })

        setPathResources(pathResourcesMap)
        setPathResourceWeights(pathResourceWeightsMap)
        setPathResourcesList({ ai_tools: aiTools, human_courses: humanCourses })
      }

      // Fetch user_stacks (to check if tools are "In Stack") - only for owners
      if (ownerCheck && user) {
        const { data: userStackData } = await supabase
          .from("user_stacks")
          .select("resource_id, status")
          .eq("user_id", user.id)

        if (userStackData) {
          const userStackMap: Record<string, string> = {}
          userStackData.forEach((us: any) => {
            userStackMap[us.resource_id] = us.status
          })
          setUserStackStatus(userStackMap)
        }
      }

      // If not owner and not public, show 404
      if (!ownerCheck && !path.is_public) {
        setState("error")
        setErrorMessage("This strategy is private")
        return
      }

      // Store strategy data
      setStrategyData({
        role: path.role || null,
        main_goal: path.main_goal || null,
        context: path.context || null
      })

      setPathTitle(path.path_title || path.main_goal || "Untitled Path")
      setCurrentHvqScore(path.current_hvq_score || null)

      // Check if path is ready (has efficiency_audit)
      if (path.efficiency_audit) {
        try {
          const efficiency = typeof path.efficiency_audit === 'string' 
            ? JSON.parse(path.efficiency_audit) 
            : path.efficiency_audit

          const immediateSteps = typeof path.immediate_steps === 'string'
            ? JSON.parse(path.immediate_steps)
            : path.immediate_steps

          // Tools and courses are now fetched from path_resources (relational)
          // They're already stored in pathResourcesList from the fetch above
          const pathData = {
            efficiency_audit: efficiency,
            immediate_steps: immediateSteps,
            current_hvq_score: path.current_hvq_score || null
          }

          // Use current_hvq_score from database (no calculation needed - score is persisted)
          // Fallback to calculated score only if current_hvq_score is not available
          const hvqScore = path.current_hvq_score ?? calculateHVQScore(pathData)

          setUpgradeData({
            ...pathData,
            current_hvq_score: hvqScore
          })
          
          setState("results")
          setIsPolling(false)
        } catch (error) {
          console.error("Error parsing upgrade path data:", error)
          setState("analyzing")
          setIsPolling(true)
        }
      } else {
        if (ownerCheck) {
          setState("analyzing")
          setIsPolling(true)
        } else {
          setState("error")
          setErrorMessage("Path is not ready yet")
        }
      }
    }

    fetchPath()
  }, [username, slug])

  // Poll for upgrade_paths when in analyzing state (only for owners)
  useEffect(() => {
    if (state !== "analyzing" || !isPolling || !isOwner || !pathId) {
      return
    }

    let pollCount = 0
    const maxPolls = 20

    const pollUpgradePath = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setIsPolling(false)
        return
      }

      pollCount++
      console.log(`📡 Polling Attempt ${pollCount}/${maxPolls}...`)

      // Using explicit column names: hvq_score_machine, hvq_score_human, impact_weight, and current_hvq_score
      const { data: upgradePath, error } = await supabase
        .from("upgrade_paths")
        .select(`
          *,
          path_resources (
            status,
            impact_weight,
            resources (
              id,
              name,
              type,
              description,
              url,
              logo_url,
              hvq_score_machine,
              hvq_score_human
            )
          )
        `)
        .eq("id", pathId)
        .maybeSingle()

      if (!error && upgradePath && upgradePath.efficiency_audit) {
        try {
          const efficiency = typeof upgradePath.efficiency_audit === 'string' 
            ? JSON.parse(upgradePath.efficiency_audit) 
            : upgradePath.efficiency_audit

          const immediateSteps = typeof upgradePath.immediate_steps === 'string'
            ? JSON.parse(upgradePath.immediate_steps)
            : upgradePath.immediate_steps

          const pathData = {
            efficiency_audit: efficiency,
            immediate_steps: immediateSteps,
            current_hvq_score: upgradePath.current_hvq_score ?? null
          }

          // Use current_hvq_score from database (no calculation needed - score is persisted)
          // Fallback to calculated score only if current_hvq_score is not available
          const hvqScore = upgradePath.current_hvq_score ?? calculateHVQScore(pathData)

          setUpgradeData({
            ...pathData,
            current_hvq_score: hvqScore
          })
          
          // Process path_resources: filter out removed and separate by type
          if (upgradePath.path_resources && Array.isArray(upgradePath.path_resources)) {
            // UI Filter: Only render items where status !== 'removed'
            const visiblePathResources = upgradePath.path_resources.filter(
              (pr: any) => pr.status !== 'removed'
            )

            const pathResourcesMap: Record<string, string> = {}
            const pathResourceWeightsMap: Record<string, number> = {}
            const aiTools: ResourceItem[] = []
            const humanCourses: ResourceItem[] = []

            visiblePathResources.forEach((pr: any) => {
              // Access resources from the nested structure
              const resource = pr.resources
              if (resource && resource.id) {
                pathResourcesMap[resource.id] = pr.status
                // Store impact_weight from path_resources table
                pathResourceWeightsMap[resource.id] = pr.impact_weight || 0

                const resourceItem: ResourceItem = {
                  id: resource.id,
                  title: resource.name,
                  description: resource.description || "",
                  url: resource.url,
                  logo_url: resource.logo_url,
                  hvq_score_machine: resource.hvq_score_machine,
                  hvq_score_human: resource.hvq_score_human,
                }

                // Logic Separation: Split by type
                // Tools: item.resources.type === 'ai_tool'
                if (resource.type === "ai_tool") {
                  aiTools.push(resourceItem)
                }
                // Courses: item.resources.type === 'human_course'
                else if (resource.type === "human_course") {
                  humanCourses.push(resourceItem)
                }
              }
            })

            setPathResources(pathResourcesMap)
            setPathResourceWeights(pathResourceWeightsMap)
            setPathResourcesList({ ai_tools: aiTools, human_courses: humanCourses })
          }
          
          // Use current_hvq_score from database (persisted after status updates)
          setCurrentHvqScore(upgradePath.current_hvq_score ?? hvqScore)
          setState("results")
          setIsPolling(false)
        } catch (e) {
          console.error("❌ Error parsing JSON:", e)
        }
      } else if (pollCount >= maxPolls) {
        setIsPolling(false)
        setState("error")
        setErrorMessage("Path generation timed out. Please try again.")
      }
    }

    pollUpgradePath()
    const interval = setInterval(pollUpgradePath, 3000)

    return () => {
      clearInterval(interval)
      setIsPolling(false)
    }
  }, [state, isPolling, isOwner, pathId])

  const handleNewPath = () => {
    if (!username) return
    setIsPolling(false)
    setState("results")
    setUpgradeData(null)
    setErrorMessage(null)
    router.push(`/u/${username}/create`)
  }

  const handleStrategyUpdate = async () => {
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

  // Unified function to update Supabase with path data
  const updatePathInSupabase = async (updatedData: UpgradePathData) => {
    if (!pathId) {
      throw new Error("pathId is required for update")
    }

    try {
      const supabase = createClient()
      const currentEfficiencyAudit = upgradeData?.efficiency_audit || {}
      const updatedEfficiencyAudit = {
        delegate_to_machine: updatedData.efficiency_audit?.delegate_to_machine ?? currentEfficiencyAudit.delegate_to_machine ?? [],
        keep_for_human: updatedData.efficiency_audit?.keep_for_human ?? currentEfficiencyAudit.keep_for_human ?? []
      }

      const payload = {
        immediate_steps: updatedData.immediate_steps ?? [],
        efficiency_audit: updatedEfficiencyAudit,
        current_hvq_score: updatedData.current_hvq_score ?? calculateHVQScore(updatedData),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from("upgrade_paths")
        .update(payload)
        .eq("id", pathId)
        .select()
    
      if (error) {
        throw error
      }
    
      return data
    } catch (error) {
      console.error("Failed to update path data:", error)
      throw error
    }
  }

  const handleToggleDelegate = async (index: number) => {
    if (!upgradeData?.efficiency_audit?.delegate_to_machine || !isOwner) return
    
    const previousData = upgradeData
    const updatedDelegateList = upgradeData.efficiency_audit.delegate_to_machine.map((item, i) =>
      i === index ? { ...item, is_completed: !item.is_completed } : item
    )

    const updatedEfficiencyAudit = {
      ...upgradeData.efficiency_audit,
      delegate_to_machine: updatedDelegateList
    }

    const updatedData = {
      ...upgradeData,
      efficiency_audit: updatedEfficiencyAudit
    }

    const newScore = calculateHVQScore(updatedData)
    setUpgradeData({ ...updatedData, current_hvq_score: newScore })
    setCurrentHvqScore(newScore)

    try {
      await updatePathInSupabase({ ...updatedData, current_hvq_score: newScore })
    } catch (error) {
      console.error("Failed to update delegate task, reverting:", error)
      setUpgradeData(previousData)
    }
  }

  const handleToggleStep = async (index: number) => {
    if (!upgradeData?.immediate_steps || !isOwner) return
    
    const previousData = upgradeData
    const updatedSteps = upgradeData.immediate_steps.map((step, i) =>
      i === index ? { ...step, is_completed: !step.is_completed } : step
    )

    const updatedData = {
      ...upgradeData,
      immediate_steps: updatedSteps
    }

    const newScore = calculateHVQScore(updatedData)
    setUpgradeData({ ...updatedData, current_hvq_score: newScore })
    setCurrentHvqScore(newScore)

    try {
      await updatePathInSupabase({ ...updatedData, current_hvq_score: newScore })
    } catch (error) {
      console.error("Failed to update immediate step, reverting:", error)
      setUpgradeData(previousData)
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
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading path...</p>
        </div>
      </div>
    )
  }

  // Analyzing State (only for owners)
  if (state === "analyzing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:0ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]"></div>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Analyzing Human Moat...</p>
        </div>
      </div>
    )
  }

  // Error State
  if (state === "error") {
    const isPrivateError = errorMessage === "This strategy is private"
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <h1 className="text-2xl font-bold mb-4">{isPrivateError ? "This Strategy is Private" : "Error"}</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-6">
            {errorMessage || "An error occurred"}
          </p>
          {isPrivateError && (
            <Link href={`/u/${username}`}>
              <Button variant="outline" className="mb-2">View Public Profile</Button>
            </Link>
          )}
          <Link href="/">
            <Button variant={isPrivateError ? "ghost" : "default"}>Go Home</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Results State - Display upgrade path data
  const delegateToMachine = upgradeData?.efficiency_audit?.delegate_to_machine || []
  const keepForHuman = upgradeData?.efficiency_audit?.keep_for_human || []
  const immediateSteps = upgradeData?.immediate_steps || []

  const displayName = profileData?.is_organization && profileData?.organization_name
    ? profileData.organization_name
    : profileData?.full_name || username

  // Calculate score badge styling
  const scoreBadgeClass = currentHvqScore !== null && currentHvqScore < 120
    ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
    : currentHvqScore !== null && currentHvqScore >= 120 && currentHvqScore <= 150
    ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800"
    : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
  
  const scoreLabel = currentHvqScore !== null && currentHvqScore < 120
    ? "Manual/Low Leverage"
    : currentHvqScore !== null && currentHvqScore >= 120 && currentHvqScore <= 150
    ? "Optimizing"
    : "High Leverage"

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-16">
        
        {/* Header Section */}
        <div className="mb-12 pb-8 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex-1">
              {isOwner ? (
                <EditablePathTitle 
                  pathId={pathId!}
                  initialTitle={pathTitle}
                  onUpdate={(newTitle) => setPathTitle(newTitle)}
                />
              ) : (
                <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
                  {pathTitle}
                </h1>
              )}
              
              {/* Author Info (for non-owners) */}
              {!isOwner && (
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 mb-4">
                  <span>by</span>
                  <Link 
                    href={`/u/${username}`}
                    className="font-semibold text-zinc-900 dark:text-zinc-50 hover:underline"
                  >
                    {displayName}
                  </Link>
                </div>
              )}
              
              {/* HVQ Score Badge */}
              {currentHvqScore !== null && (
                <div className="mt-4 flex items-center gap-3">
                  <div className={`inline-flex items-center justify-center px-4 py-2 rounded-xl font-bold text-2xl shadow-sm border-2 ${scoreBadgeClass}`}>
                    <span className="text-sm mr-1">HVQ</span>
                    <span>{currentHvqScore}</span>
                  </div>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {scoreLabel}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Action Buttons (only for owners) */}
            {isOwner && pathId && (
              <div className="flex gap-2">
                <SharePathButton pathId={pathId} initialIsPublic={isPublic} />
                
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
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
                
                <DeletePathButton pathId={pathId} />
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons (only for owners) */}
        {isOwner && (
          <div className="mb-8 flex justify-end gap-2">
            <Button
              onClick={handleNewPath}
              variant="ghost"
              size="sm"
              className="gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <Plus className="h-4 w-4" />
              New Path
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
        )}

        {/* Strategy Info */}
        {(strategyData.role || strategyData.main_goal || strategyData.context) && (
          <section className="mb-12">
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Strategy Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {strategyData.role && (
                  <div>
                    <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Role</p>
                    <p className="text-zinc-900 dark:text-zinc-50">{strategyData.role}</p>
                  </div>
                )}
                {strategyData.main_goal && (
                  <div>
                    <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Main Goal</p>
                    <p className="text-zinc-900 dark:text-zinc-50">{strategyData.main_goal}</p>
                  </div>
                )}
                {strategyData.context && (
                  <div>
                    <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Context</p>
                    <p className="text-zinc-900 dark:text-zinc-50 whitespace-pre-wrap">{strategyData.context}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

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
                        {isOwner ? (
                          <>
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
                            {item.is_completed && <ScoreBadge points={10} />}
                          </>
                        ) : (
                          <>
                            <span className={`mt-0.5 ${item.is_completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                              {item.is_completed ? '✓' : '○'}
                            </span>
                            <span className={`flex-1 ${item.is_completed ? 'text-zinc-500 dark:text-zinc-500 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                              {item.task}
                            </span>
                          </>
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

        {/* The Power Pack - AI Tools */}
        {pathResourcesList.ai_tools && pathResourcesList.ai_tools.length > 0 && (() => {
          // Tools are already filtered (status != 'removed') from the fetch
          const visibleTools = pathResourcesList.ai_tools

          if (visibleTools.length === 0) return null

          return (
            <section className="mb-16">
              <div className="mb-8 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-3xl font-light tracking-tight text-black dark:text-zinc-50">
                    Top 3 AI Tools
                  </h2>
                </div>
                {isOwner && currentUserId && (
                  <AddToolSearch userId={currentUserId} />
                )}
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {visibleTools.map((tool, i) => {
                  const toolId = tool.id && tool.id !== 'null' ? tool.id : null
                  const pathResourceStatus = toolId ? (pathResources[toolId] || 'suggested') : 'suggested'
                  const stackStatus = toolId ? userStackStatus[toolId] : null
                  
                  // Unified status system
                  const isRemoved = pathResourceStatus === 'removed'
                  
                  // Don't render if removed
                  if (isRemoved) return null

                  // Callback to refresh data after status change
                  // Reactive UI: Update local state for impact_weight so the score badge updates immediately
                  const handleStatusChange = (newStatus?: string) => {
                    // Define weights mapping (must match actions/path-resources.ts)
                    const weights: Record<string, number> = {
                      suggested: 0.5,
                      added_free: 1.0,
                      added_enrolled: 1.0,
                      added_paid: 1.5,
                      added_completed: 1.5,
                      wishlisted: 0.2,
                      removed: 0
                    }
                    
                    // Update impact_weight in local state immediately (reactive UI)
                    if (toolId && newStatus) {
                      // Update pathResources state with new status
                      setPathResources(prev => ({
                        ...prev,
                        [toolId]: newStatus
                      }))
                      
                      // Update impact_weight based on new status
                      const newWeight = weights[newStatus] || 0
                      setPathResourceWeights(prev => ({
                        ...prev,
                        [toolId]: newWeight
                      }))
                    }
                    
                    // Recalculate HVQ score with updated weights
                    const newScore = calculateHVQScore({
                      ...upgradeData!,
                      current_hvq_score: undefined
                    })
                    setUpgradeData(prev => prev ? { ...prev, current_hvq_score: newScore } : null)
                    setCurrentHvqScore(newScore)
                    router.refresh()
                  }

                  // Map path status to user_stacks status for initial display
                  const getInitialStackStatus = () => {
                    if (pathResourceStatus === 'added_paid') return 'paying'
                    if (pathResourceStatus === 'added_free') return 'free_user'
                    if (pathResourceStatus === 'wishlisted') return 'wishlist'
                    return stackStatus || undefined
                  }

                  return (
                    <Card key={i} className={`relative ${isOwner ? "group transition-all hover:border-blue-200 hover:shadow-md dark:hover:border-blue-800" : "border-zinc-200 dark:border-zinc-800"}`}>
                      <CardHeader>
                        <div className="shrink-0 mt-1">
                          <ResourceIcon 
                            logo_url={toolId ? resourceLogos[toolId] : undefined}
                            url={tool.url}
                            name={tool.title}
                            className="w-16 h-16 rounded-md object-contain bg-white border border-zinc-100 p-1"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-lg">{tool.title}</CardTitle>
                          {/* Status Badge: Show suggested badge if not added */}
                          {toolId && pathResourceStatus === 'suggested' && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                              Suggested
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                          {tool.description}
                        </p>
                        {tool.capabilities && tool.capabilities.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {tool.capabilities.slice(0, 3).map((cap: string, i: number) => (
                              <span key={i} className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-1 rounded-sm border border-gray-200">
                                {cap}
                              </span>
                            ))}
                          </div>
                        )}
                        {tool.url && (
                          <a href={tool.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                            View Tool →
                          </a>
                        )}
                        {isOwner && toolId && (
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                            <StackManager 
                              resourceId={toolId} 
                              initialStatus={getInitialStackStatus()}
                              pathId={pathId}
                              pathResourceStatus={pathResourceStatus}
                              onStatusChange={handleStatusChange}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          )
        })()}

        {/* Human Courses */}
        {pathResourcesList.human_courses && pathResourcesList.human_courses.length > 0 && (
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
              {pathResourcesList.human_courses.map((course, i) => {
                const courseId = course.id
                const pathResourceStatus = courseId ? (pathResources[courseId] || 'suggested') : 'suggested'
                const stackStatus = courseId ? userStackStatus[courseId] : null
                const isRemoved = pathResourceStatus === 'removed'
                
                // Don't render if removed
                if (isRemoved) return null

                // Map path status to user_stacks status for initial display
                const getInitialStackStatus = () => {
                  if (pathResourceStatus === 'added_enrolled') return 'enrolled'
                  if (pathResourceStatus === 'added_completed') return 'completed'
                  if (pathResourceStatus === 'wishlisted') return 'todo'
                  return stackStatus || undefined
                }

                // Callback to refresh data after status change
                // Reactive UI: Update local state for impact_weight so the score badge updates immediately
                const handleStatusChange = (newStatus?: string) => {
                  // Define weights mapping (must match actions/path-resources.ts)
                  const weights: Record<string, number> = {
                    suggested: 0.5,
                    added_free: 1.0,
                    added_enrolled: 1.0,
                    added_paid: 1.5,
                    added_completed: 1.5,
                    wishlisted: 0.2,
                    removed: 0
                  }
                  
                  // Update impact_weight in local state immediately (reactive UI)
                  if (courseId && newStatus) {
                    // Update pathResources state with new status
                    setPathResources(prev => ({
                      ...prev,
                      [courseId]: newStatus
                    }))
                    
                    // Update impact_weight based on new status
                    const newWeight = weights[newStatus] || 0
                    setPathResourceWeights(prev => ({
                      ...prev,
                      [courseId]: newWeight
                    }))
                  }
                  
                  // Recalculate HVQ score with updated weights
                  const newScore = calculateHVQScore({
                    ...upgradeData!,
                    current_hvq_score: undefined
                  })
                  setUpgradeData(prev => prev ? { ...prev, current_hvq_score: newScore } : null)
                  setCurrentHvqScore(newScore)
                  router.refresh()
                }
                
                return (
                  <Card key={i} className={isOwner ? "group transition-all hover:border-purple-200 hover:shadow-md dark:hover:border-purple-800" : "border-zinc-200 dark:border-zinc-800"}>
                    <CardHeader>
                      <div className="shrink-0 mt-1">
                        <ResourceIcon 
                          logo_url={courseId ? resourceLogos[courseId] : course.logo_url}
                          url={course.url}
                          name={course.title}
                          className="w-16 h-16 rounded-md object-contain bg-white border border-zinc-100 p-1"
                        />
                      </div>
                      <CardTitle className="text-lg">{course.title}</CardTitle>
                      {/* Status Badge: Show suggested badge if not added */}
                      {courseId && pathResourceStatus === 'suggested' && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 mt-2 inline-block">
                          Suggested
                        </span>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                        {course.description}
                      </p>
                      {course.url && (
                        <a href={course.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-purple-600 hover:underline dark:text-purple-400">
                          View Course →
                        </a>
                      )}
                      {isOwner && courseId && (
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                          <StackManager 
                            resourceId={courseId} 
                            initialStatus={getInitialStackStatus()}
                            isCourse={true}
                            pathId={pathId}
                            pathResourceStatus={pathResourceStatus}
                            onStatusChange={handleStatusChange}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        {/* Immediate Steps */}
        {immediateSteps.length > 0 && (
          <section className="mb-20">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Footprints className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-3xl font-light tracking-tight text-black dark:text-zinc-50">
                {isOwner ? "Your Immediate Action Plan" : "Immediate Steps"}
              </h2>
            </div>
            <div className="grid gap-4">
              {immediateSteps.map((step, i) => (
                <Card key={i} className={`${isOwner ? 'border-l-4 border-l-emerald-500 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-900' : 'border-zinc-200 dark:border-zinc-800'}`}>
                  <CardContent className="flex items-start gap-4 p-6">
                    {isOwner ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <span className={`mt-0.5 ${step.is_completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                          {step.is_completed ? '✓' : `${i + 1}.`}
                        </span>
                        <span className={`flex-1 ${step.is_completed ? 'text-zinc-500 dark:text-zinc-500 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                          {step.text}
                        </span>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Accountability Bridge (only for owners) */}
        {isOwner && (
          <section>
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-2xl font-light tracking-tight">
                  Accountability Bridge
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-4">
                <p className="text-zinc-600 dark:text-zinc-400">
                  Set a check-in reminder to track your progress on your Human+ journey.
                </p>
                <Button onClick={() => alert("Check-in reminder set!")} size="lg" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Check-in
                </Button>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Created with HumanVQ Badge (only for non-owners) */}
        {!isOwner && (
          <div className="mt-20 pt-12 border-t border-zinc-200 dark:border-zinc-800 text-center">
            <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
              <span className="text-sm">Created with</span>
              <span className="text-lg font-semibold">HumanVQ</span>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
