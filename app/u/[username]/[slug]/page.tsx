"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Bot, GraduationCap, Footprints, Calendar, Settings, Target, LayoutDashboard, Activity, Wrench, Trash2 } from "lucide-react"
import ResourceIcon from "@/components/resource-icon"
import { createClient } from "@/utils/supabase/client"
import StackManager from "@/components/stack-manager"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { IntakeForm } from "@/components/IntakeForm"
import { EditablePathTitle } from "@/components/editable-path-title"
import { DeletePathButton } from "@/components/delete-path-button"
import { ShareButton } from "@/components/share-button"
import { RemoveFromPathButton } from "@/components/remove-from-path-button"
import AddToolSearch from "@/components/add-tool-search"
import Link from "next/link"
import { calculateHVQScore } from "@/lib/hvq-logic"
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
  logodev?: string
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

  console.log("🚀 [Path Page] Component mounted/rendered with params:", { username, slug })

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
  const [pathResourcesList, setPathResourcesList] = useState<{
    ai_tools: ResourceItem[]
    human_courses: ResourceItem[]
  }>({ ai_tools: [], human_courses: [] })

  // Edit Strategy Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  
  // New step input state
  const [newStepText, setNewStepText] = useState("")

  useEffect(() => {
    const fetchLogos = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("resources").select("id, logodev")
      if (data) {
        const logoMap = data.reduce((acc, curr) => {
          if (curr.logodev) acc[curr.id] = curr.logodev
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
      console.log("🔍 [Path Page] Starting fetchPath")
      console.log("🔍 [Path Page] Params - username:", username, "slug:", slug)
      
      const supabase = createClient()
      
      // Get current user for ownership check
      const { data: { user } } = await supabase.auth.getUser()
      console.log("🔍 [Path Page] Current user:", user?.id || "not authenticated")
      setCurrentUserId(user?.id || null)

      // STEP 1: Fetch profile by username from URL
      console.log("🔍 [Path Page] Fetching profile for username:", username)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, full_name, username, is_organization, organization_name")
        .eq("username", username)
        .maybeSingle()

      console.log("🔍 [Path Page] Profile fetch result:", { profile, profileError })

      if (!profile) {
        console.error("❌ [Path Page] Profile not found for username:", username)
        setState("error")
        setErrorMessage(`User with username "${username}" not found`)
        return
      }

      console.log("✅ [Path Page] Profile found:", profile.user_id)

      setProfileData({
        user_id: profile.user_id,
        full_name: profile.full_name,
        is_organization: profile.is_organization || false,
        organization_name: profile.organization_name
      })

      // STEP 2: Fetch path with nested path_resources and resources
      // Using explicit column names: hvq_score_machine, hvq_score_human, impact_weight, and current_hvq_score
      // Note: current_hvq_score is persisted after status updates in actions/path-resources.ts
      
      // Helper function to check if a string is a UUID
      const isUUID = (str: string): boolean => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        return uuidRegex.test(str)
      }

      console.log("🔍 [Path Page] Fetching path with slug:", slug, "for user_id:", profile.user_id)
      console.log("🔍 [Path Page] Slug is UUID?", isUUID(slug))
      
      // First, try to fetch by slug
      let { data: path, error: pathError } = await supabase
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
              logodev,
              hvq_score_machine,
              hvq_score_human
            )
          )
        `)
        .eq("slug", slug)
        .eq("user_id", profile.user_id)
        .maybeSingle()

      console.log("🔍 [Path Page] Path fetch by slug result:", { 
        pathFound: !!path, 
        pathId: path?.id,
        pathTitle: path?.path_title,
        pathSlug: path?.slug,
        pathError: pathError ? {
          message: pathError.message,
          details: pathError.details,
          hint: pathError.hint,
          code: pathError.code
        } : null
      })

      // If path not found by slug AND slug looks like a UUID (path ID), try fetching by ID instead
      // This handles the case where slug is NULL in the database
      if ((!path || pathError) && isUUID(slug)) {
        console.log("🔄 [Path Page] Path not found by slug, trying to fetch by ID (UUID):", slug)
        const { data: pathById, error: pathByIdError } = await supabase
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
                logodev,
                hvq_score_machine,
                hvq_score_human
              )
            )
          `)
          .eq("id", slug)
          .eq("user_id", profile.user_id)
          .maybeSingle()

        console.log("🔍 [Path Page] Path fetch by ID result:", { 
          pathFound: !!pathById, 
          pathId: pathById?.id,
          pathTitle: pathById?.path_title,
          pathSlug: pathById?.slug,
          pathByIdError: pathByIdError ? {
            message: pathByIdError.message,
            details: pathByIdError.details,
            hint: pathByIdError.hint,
            code: pathByIdError.code
          } : null
        })

        if (pathById && !pathByIdError) {
          path = pathById
          pathError = null
          console.log("✅ [Path Page] Found path by ID, slug in DB is:", path.slug || "NULL")
        } else {
          pathError = pathByIdError || pathError
        }
      }

      if (pathError) {
        console.error("❌ [Path Page] Path fetch error:", pathError)
      }

      if (pathError || !path) {
        console.error("❌ [Path Page] Path not found - slug:", slug, "user_id:", profile.user_id)
        setState("error")
        setErrorMessage("Path not found")
        return
      }

      console.log("✅ [Path Page] Path found:", path.id, "Title:", path.path_title)

      setPathId(path.id)
      setIsPublic(path.is_public || false)

      // Check ownership: auth.user.id === path.user_id
      const ownerCheck = user && user.id === path.user_id
      console.log("🔍 [Path Page] Ownership check:", { 
        isOwner: ownerCheck, 
        currentUserId: user?.id, 
        pathUserId: path.user_id,
        isPublic: path.is_public 
      })
      setIsOwner(ownerCheck || false)

      // Process path_resources: filter out removed and separate by type
      if (path.path_resources && Array.isArray(path.path_resources)) {
        // UI Filter: Only render items where status !== 'removed'
        const visiblePathResources = (path.path_resources || []).filter(
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
              logodev: resource.logodev,
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

      // Note: path_resources is now the single source of truth
      // We don't need to fetch a separate userStackStatus - pathResources state already contains the status

      // If not owner and not public, show 404
      if (!ownerCheck && !path.is_public) {
        console.error("❌ [Path Page] Access denied - path is private")
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

      const pathTitleValue = path.path_title || path.main_goal || "Untitled Path"
      setPathTitle(pathTitleValue)
      setCurrentHvqScore(path.current_hvq_score || null)

      // Check if path_title is still 'Untitled Path' - show loading state
      if (pathTitleValue === "Untitled Path") {
        console.log("⏳ [Path Page] Path is still being generated (Untitled Path)")
        if (ownerCheck) {
          console.log("⏳ [Path Page] Owner - showing analyzing state and starting polling")
          setState("analyzing")
          setIsPolling(true)
        } else {
          console.error("❌ [Path Page] Non-owner trying to access path that's not ready")
          setState("error")
          setErrorMessage("Path is not ready yet")
        }
        return
      }

      // Check if slug changed (UUID to title-based) and redirect if needed
      // Only redirect if slug exists and is different from current slug and not the path ID
      if (path.slug && path.slug !== slug && path.slug !== path.id) {
        console.log("🔄 [Path Page] Slug mismatch - redirecting:", {
          currentSlug: slug,
          pathSlug: path.slug,
          pathId: path.id,
          redirectTo: `/u/${username}/${path.slug}`
        })
        // Slug was updated to title-based, redirect to new URL
        router.replace(`/u/${username}/${path.slug}`)
        return
      }

      // If slug is NULL in database but we found path by ID, log it but continue rendering
      if (!path.slug && isUUID(slug)) {
        console.log("⚠️ [Path Page] Path found by ID but slug is NULL in database. Path will be accessible via ID until slug is generated.")
      }

      // Check if path is ready (has efficiency_audit)
      console.log("🔍 [Path Page] Checking if path is ready - has efficiency_audit:", !!path.efficiency_audit)
      if (path.efficiency_audit) {
        try {
          console.log("✅ [Path Page] Path has efficiency_audit - parsing data")
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

          console.log("🔍 [Path Page] Path data prepared:", {
            hasEfficiencyAudit: !!pathData.efficiency_audit,
            immediateStepsCount: pathData.immediate_steps?.length || 0,
            currentHvqScore: pathData.current_hvq_score
          })

          // Use current_hvq_score from database (no calculation needed - score is persisted)
          // Fallback to calculated score only if current_hvq_score is not available
          const hvqScore = path.current_hvq_score ?? calculateHVQScore(pathData, pathResourcesList, pathResourceWeights)

          setUpgradeData({
            ...pathData,
            current_hvq_score: hvqScore
          })
          
          console.log("✅ [Path Page] Setting state to 'results'")
          setState("results")
          setIsPolling(false)
        } catch (error) {
          console.error("❌ [Path Page] Error parsing upgrade path data:", error)
          setState("analyzing")
          setIsPolling(true)
        }
      } else {
        console.log("⏳ [Path Page] Path not ready yet - no efficiency_audit")
        if (ownerCheck) {
          console.log("⏳ [Path Page] Owner - showing analyzing state and starting polling")
          setState("analyzing")
          setIsPolling(true)
        } else {
          console.error("❌ [Path Page] Non-owner trying to access path that's not ready")
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
      // Also fetch path_title and slug to detect changes
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
              logodev,
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
          const hvqScore = upgradePath.current_hvq_score ?? calculateHVQScore(pathData, pathResourcesList, pathResourceWeights)

          setUpgradeData({
            ...pathData,
            current_hvq_score: hvqScore
          })
          
          // Process path_resources: filter out removed and separate by type
          if (upgradePath.path_resources && Array.isArray(upgradePath.path_resources)) {
            // UI Filter: Only render items where status !== 'removed'
            const visiblePathResources = (upgradePath.path_resources || []).filter(
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
                  logodev: resource.logodev,
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
        current_hvq_score: updatedData.current_hvq_score ?? calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights),
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
    const updatedDelegateList = (upgradeData.efficiency_audit?.delegate_to_machine || []).map((item, i) =>
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

    const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights)
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
    const updatedSteps = (upgradeData.immediate_steps || []).map((step, i) =>
      i === index ? { ...step, is_completed: !step.is_completed } : step
    )

    const updatedData = {
      ...upgradeData,
      immediate_steps: updatedSteps
    }

    const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights)
    setUpgradeData({ ...updatedData, current_hvq_score: newScore })
    setCurrentHvqScore(newScore)

    try {
      await updatePathInSupabase({ ...updatedData, current_hvq_score: newScore })
    } catch (error) {
      console.error("Failed to update immediate step, reverting:", error)
      setUpgradeData(previousData)
    }
  }

  const handleAddStep = async () => {
    if (!newStepText.trim() || !upgradeData?.immediate_steps || !isOwner) return

    const previousData = upgradeData
    const newStep: ImmediateStepItem = {
      text: newStepText.trim(),
      is_completed: false
    }

    const updatedSteps = [...upgradeData.immediate_steps, newStep]
    const updatedData = {
      ...upgradeData,
      immediate_steps: updatedSteps
    }

    const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights)
    setUpgradeData({ ...updatedData, current_hvq_score: newScore })
    setCurrentHvqScore(newScore)
    setNewStepText("")

    try {
      await updatePathInSupabase({ ...updatedData, current_hvq_score: newScore })
    } catch (error) {
      console.error("Failed to add immediate step, reverting:", error)
      setUpgradeData(previousData)
    }
  }

  const handleRemoveStep = async (index: number) => {
    // TODO: Implement backend and database update
    console.log("Remove step at index:", index)
  }

  // Loading State
  if (state === "loading") {
    console.log("⏳ [Path Page] Rendering loading state")
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
    console.error("❌ [Path Page] Rendering error state:", errorMessage)
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

  // Calculate path-specific metrics
  const automatedTasksCompleted = (delegateToMachine || []).filter((task: DelegateTaskItem) => task.is_completed === true).length
  const stepsCompleted = (immediateSteps || []).filter((step: ImmediateStepItem) => step.is_completed === true).length
  const toolsAdded = pathResourcesList?.ai_tools?.length || 0

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-6 py-16">
        
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1">
              {isOwner ? (
                <EditablePathTitle 
                  pathId={pathId!}
                  initialTitle={pathTitle}
                  onUpdate={(newTitle) => setPathTitle(newTitle)}
                />
              ) : (
                <h1 className="text-2xl font-normal text-zinc-900 dark:text-zinc-50">
                  {pathTitle}
                </h1>
              )}
              
              {/* Author Info (for non-owners) */}
              {!isOwner && (
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 mt-2">
                  <span>by</span>
                  <Link 
                    href={`/u/${username}`}
                    className="font-semibold text-zinc-900 dark:text-zinc-50 hover:underline"
                  >
                    {displayName}
                  </Link>
                </div>
              )}
            </div>

            {/* Right: Action Buttons (only for owners) */}
            {isOwner && pathId && (
              <div className="flex gap-2">
                <ShareButton 
                  targetType="path"
                  targetId={pathId}
                  isOwner={isOwner}
                  initialVisibility={isPublic}
                  pathTitle={pathTitle}
                  userName={profileData?.full_name || undefined}
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                />
                
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                      <Settings className="h-4 w-4" />
                      Edit Path
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Path</DialogTitle>
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

          {/* Metrics Row - 4 columns with sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* HVQ Score */}
            <Card className="p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-blue-600 dark:text-blue-400">HVQ Score</div>
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <LayoutDashboard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{currentHvqScore ?? 100}</div>
                <div className="w-20 h-8">
                  <svg width="100%" height="32" className="text-blue-600 dark:text-blue-400">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const barHeight = Math.random() * 18 + 6 + ((currentHvqScore ?? 100 - 100) / 15)
                      const x = (i * 11) + 2
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={32 - Math.min(barHeight, 26)}
                          width="4"
                          height={Math.min(barHeight, 26)}
                          fill="currentColor"
                          opacity={0.6 + (i / 7) * 0.4}
                        />
                      )
                    })}
                  </svg>
                </div>
              </div>
            </Card>

            {/* Automated Tasks */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Automated Tasks</div>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{automatedTasksCompleted}</div>
                <div className="w-20 h-8">
                  <svg width="100%" height="32" className="text-emerald-500">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const barHeight = Math.random() * 16 + 6 + Math.min(automatedTasksCompleted * 2, 8)
                      const x = (i * 11) + 2
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={32 - Math.min(barHeight, 26)}
                          width="4"
                          height={Math.min(barHeight, 26)}
                          fill="currentColor"
                          opacity={0.6 + (i / 7) * 0.4}
                        />
                      )
                    })}
                  </svg>
                </div>
              </div>
            </Card>

            {/* Steps Completed */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Steps Completed</div>
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Footprints className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stepsCompleted}</div>
                <div className="w-20 h-8">
                  <svg width="100%" height="32" className="text-purple-500">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const barHeight = Math.random() * 15 + 6 + (stepsCompleted * 1.5)
                      const x = (i * 11) + 2
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={32 - Math.min(barHeight, 26)}
                          width="4"
                          height={Math.min(barHeight, 26)}
                          fill="currentColor"
                          opacity={0.6 + (i / 7) * 0.4}
                        />
                      )
                    })}
                  </svg>
                </div>
              </div>
            </Card>

            {/* Tools Added */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Tools Added</div>
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{toolsAdded}</div>
                <div className="w-20 h-8">
                  <svg width="100%" height="32" className="text-orange-500">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const barHeight = Math.random() * 14 + 6 + (toolsAdded * 2)
                      const x = (i * 11) + 2
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={32 - Math.min(barHeight, 26)}
                          width="4"
                          height={Math.min(barHeight, 26)}
                          fill="currentColor"
                          opacity={0.6 + (i / 7) * 0.4}
                        />
                      )
                    })}
                  </svg>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Efficiency Audit */}
        <section className="mb-20">
          <h2 className="mb-8 text-2xl font-normal text-black dark:text-zinc-50">
            Efficiency Audit
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Delegate to Machine */}
            <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-emerald-900 dark:text-emerald-400">
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
            <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-950/20">
              <CardHeader>
                <CardTitle className="text-xl font-normal text-orange-900 dark:text-orange-400">
                  Keep for Human
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {keepForHuman.length > 0 ? (
                    keepForHuman.map((item, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <span className="text-orange-600 dark:text-orange-400">•</span>
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
        {pathResourcesList?.ai_tools && pathResourcesList.ai_tools.length > 0 && (() => {
          // Tools are already filtered (status != 'removed') from the fetch
          const visibleTools = pathResourcesList.ai_tools || []

          if (visibleTools.length === 0) return null

          return (
            <section className="mb-16">
              <div className="mb-8 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Bot className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-normal text-black dark:text-zinc-50">
                    AI Toolstack
                  </h2>
                </div>
                {isOwner && currentUserId && pathId && (
                  <AddToolSearch 
                    pathId={pathId} 
                    userId={currentUserId}
                    onAdd={(resource, type) => {
                      // Optimistically add resource to beginning of list
                      if (type === 'ai_tool') {
                        setPathResourcesList(prev => ({
                          ...prev,
                          ai_tools: [resource, ...(prev.ai_tools || [])]
                        }))
                        // Set status to 'wishlisted' for the new tool
                        setPathResources(prev => ({
                          ...prev,
                          [resource.id]: 'wishlisted'
                        }))
                        setPathResourceWeights(prev => ({
                          ...prev,
                          [resource.id]: 0.2 // weight for wishlisted
                        }))
                      } else if (type === 'human_course') {
                        setPathResourcesList(prev => ({
                          ...prev,
                          human_courses: [resource, ...(prev.human_courses || [])]
                        }))
                        // Set status to 'wishlisted' for the new course
                        setPathResources(prev => ({
                          ...prev,
                          [resource.id]: 'wishlisted'
                        }))
                        setPathResourceWeights(prev => ({
                          ...prev,
                          [resource.id]: 0.2 // weight for wishlisted
                        }))
                      }
                    }}
                  />
                )}
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {(visibleTools || []).map((tool, i) => {
                  const toolId = tool.id && tool.id !== 'null' ? tool.id : null
                  const pathResourceStatus = toolId ? (pathResources[toolId] || 'suggested') : 'suggested'
                  
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
                    const { current_hvq_score: _, ...dataForCalculation } = upgradeData!
                    const newScore = calculateHVQScore(
                      dataForCalculation,
                      pathResourcesList,
                      pathResourceWeights
                    )
                    setUpgradeData(prev => prev ? { ...prev, current_hvq_score: newScore } : null)
                    setCurrentHvqScore(newScore)
                    router.refresh()
                  }

                  // Map path_resources status to display status for StackManager
                  const getInitialStackStatus = () => {
                    if (pathResourceStatus === 'added_paid') return 'paying'
                    if (pathResourceStatus === 'added_free') return 'free_user'
                    if (pathResourceStatus === 'wishlisted') return 'wishlist'
                    return undefined
                  }

                  return (
                    <Card key={i} className={`relative ${isOwner ? "group transition-all hover:border-blue-200 dark:hover:border-blue-800" : "border-zinc-200 dark:border-zinc-800"}`}>
                      {/* Trash icon button - appears on hover for all resources */}
                      {isOwner && toolId && (
                        <div 
                          className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                        >
                          <RemoveFromPathButton
                            pathId={pathId!}
                            resourceId={toolId}
                            onStatusChange={handleStatusChange}
                          />
                        </div>
                      )}
                      <CardHeader>
                        <div className="shrink-0 mt-1">
                          <ResourceIcon 
                            logodev={toolId ? resourceLogos[toolId] || tool.logodev : tool.logodev}
                            url={tool.url}
                            name={tool.title}
                            className="w-16 h-16 rounded-lg object-contain bg-white p-1"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm font-semibold">{tool.title}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="mb-2 text-xs text-zinc-500">
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
                        {isOwner && toolId && (
                          <div className="mt-4 flex items-center gap-2 flex-wrap">
                            <StackManager 
                              resourceId={toolId} 
                              initialStatus={getInitialStackStatus()}
                              pathId={pathId}
                              pathResourceStatus={pathResourceStatus}
                              onStatusChange={handleStatusChange}
                            />
                            {tool.url && (
                              <a 
                                href={tool.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                              >
                                View Tool
                              </a>
                            )}
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
        {pathResourcesList?.human_courses && pathResourcesList.human_courses.length > 0 && (
          <section className="mb-20">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <GraduationCap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="text-2xl font-normal text-black dark:text-zinc-50">
                Human Skills
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {(pathResourcesList.human_courses || []).map((course, i) => {
                const courseId = course.id
                const pathResourceStatus = courseId ? (pathResources[courseId] || 'suggested') : 'suggested'
                const isRemoved = pathResourceStatus === 'removed'
                
                // Don't render if removed
                if (isRemoved) return null

                // Map path_resources status to display status for StackManager
                const getInitialStackStatus = () => {
                  if (pathResourceStatus === 'added_enrolled') return 'enrolled'
                  if (pathResourceStatus === 'added_completed') return 'completed'
                  if (pathResourceStatus === 'wishlisted') return 'todo'
                  return undefined
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
                  const { current_hvq_score: _, ...dataForCalculation } = upgradeData!
                  const newScore = calculateHVQScore(
                    dataForCalculation,
                    pathResourcesList,
                    pathResourceWeights
                  )
                  setUpgradeData(prev => prev ? { ...prev, current_hvq_score: newScore } : null)
                  setCurrentHvqScore(newScore)
                  router.refresh()
                }
                
                return (
                  <Card key={i} className={`relative ${isOwner ? "group transition-all hover:border-purple-200 dark:hover:border-purple-800" : "border-zinc-200 dark:border-zinc-800"}`}>
                    {/* Trash icon button - appears on hover for all resources */}
                    {isOwner && courseId && (
                      <div 
                        className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                      >
                        <RemoveFromPathButton
                          pathId={pathId!}
                          resourceId={courseId}
                          onStatusChange={handleStatusChange}
                        />
                      </div>
                    )}
                    <CardHeader>
                      <div className="shrink-0 mt-1">
                        <ResourceIcon 
                          logodev={courseId ? resourceLogos[courseId] || course.logodev : course.logodev}
                          url={course.url}
                          name={course.title}
                          className="w-16 h-16 rounded-lg object-contain bg-white p-1"
                        />
                      </div>
                      <CardTitle className="text-sm font-semibold">{course.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-3 text-xs text-zinc-500">
                        {course.description}
                      </p>
                      {isOwner && courseId && (
                        <div className="mt-4 flex items-center gap-2 flex-wrap">
                          <StackManager 
                            resourceId={courseId} 
                            initialStatus={getInitialStackStatus()}
                            isCourse={true}
                            pathId={pathId}
                            pathResourceStatus={pathResourceStatus}
                            onStatusChange={handleStatusChange}
                          />
                          {course.url && (
                            <a 
                              href={course.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                            >
                              View Course
                            </a>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        {/* Next Steps */}
        {(immediateSteps.length > 0 || isOwner) && (
          <section className="mb-20">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Footprints className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-2xl font-normal text-black dark:text-zinc-50">
                Next Steps
              </h2>
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
              <table className="w-full">
                <tbody className="bg-white dark:bg-zinc-950 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {immediateSteps.length > 0 ? (
                    immediateSteps.map((step, i) => (
                      <tr key={i} className={`${step.is_completed ? 'opacity-60' : ''} ${isOwner ? 'hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer group' : ''}`} onClick={() => isOwner && handleToggleStep(i)}>
                        {isOwner && (
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={step.is_completed}
                              onCheckedChange={() => handleToggleStep(i)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            {i + 1}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className={`${
                            step.is_completed 
                              ? "line-through text-zinc-500 dark:text-zinc-500" 
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}>
                            {step.text}
                          </p>
                        </td>
                        {isOwner && (
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleRemoveStep(i)
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20 rounded p-1"
                              title="Remove step"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      {isOwner && <td className="px-4 py-3"></td>}
                      <td className="px-4 py-3" colSpan={isOwner ? 2 : 2}>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">No steps yet</p>
                      </td>
                      {isOwner && <td className="px-4 py-3"></td>}
                    </tr>
                  )}
                  {isOwner && (
                    <tr className="bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                      {isOwner && <td className="px-4 py-3"></td>}
                      <td className="px-4 py-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-sm font-bold text-zinc-500 dark:text-zinc-400">
                          +
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <form onSubmit={(e) => { e.preventDefault(); handleAddStep(); }} className="flex items-center gap-2">
                          <Input
                            type="text"
                            value={newStepText}
                            onChange={(e) => setNewStepText(e.target.value)}
                            placeholder="Add a new step..."
                            className="flex-1"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddStep();
                              }
                            }}
                          />
                        </form>
                      </td>
                      {isOwner && <td className="px-4 py-3"></td>}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
