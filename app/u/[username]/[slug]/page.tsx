"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Bot, GraduationCap, Footprints, Calendar, Settings, Target, LayoutDashboard, Activity, Wrench, Trash2, Edit2, X, Shield, Lock } from "lucide-react"
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
import { KnowledgeDecayBanner } from "@/components/knowledge-decay-banner"
import { InfoTooltip } from "@/components/info-tooltip"
import { ReplacementRiskPill } from "@/components/replacement-risk-pill"
import { AbsoluteTooltip } from "@/components/absolute-tooltip"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import Link from "next/link"
import {
  calculateHVQScore,
  calculateVulnerability,
  GOAL_PILLAR_MAP,
  HVQ_DECAY_RATE,
  EXECUTION_BONUS_PER_STEP,
  HUMAN_MASTERY_BONUS_PER_TASK,
  type HumanPillars,
} from "@/lib/hvq-logic"
// StackManager now handles all resource management via updateResourceStatus

// Define the shape of a delegate task item
interface DelegateTaskItem {
  task: string
  is_completed: boolean
  is_automated?: boolean
  hours_per_week?: number
}

interface ImmediateStepItem {
  text: string
  is_completed: boolean
}

// n8n Schema Interfaces
interface N8NAITool {
  id: string | null
  title: string
  description: string
  url: string
  capabilities: string[]
  difficulty_level: number
}

interface N8NHumanCourse {
  id: string | null
  title: string
  description: string
  url: string
  hvq_primary_pillar: "liability" | "context" | "edgeCase" | "connection"
}

interface ResourceItem {
  id?: string
  userId?: string
  title: string
  description: string
  logodev?: string
  url?: string
  capabilities?: string[] // Only for AI tools, not human courses
  difficulty_level?: number // Only for AI tools
  hvq_score_machine?: number
  hvq_score_human?: number
  hvq_primary_pillar?: string
  paid_count?: number
  completion_count?: number
  enrollment_count?: number
}

interface KeepForHumanItem {
  task: string
  is_completed?: boolean
}

interface UpgradePathData {
  efficiency_audit?: {
    delegate_to_machine?: DelegateTaskItem[]
    keep_for_human?: Array<{ task: string; is_completed?: boolean; is_fortified?: boolean }>
  }
  // Note: ai_tools and human_courses are now fetched from path_resources (relational)
  // They are stored in pathResourcesList state, not in this interface
  immediate_steps?: ImmediateStepItem[]
  current_hvq_score?: number
  updated_at?: string | null
}

type AppState = "loading" | "analyzing" | "results" | "error"

/** Default Human Pillars when path pillars are not yet available; yields vulnerability 0.5. */
const DEFAULT_PILLARS: HumanPillars = { liability: 0.5, context: 0.5, edgeCase: 0.5, connection: 0.5 }

function buildPillars(p: {
  pillar_liability?: number | null
  pillar_context?: number | null
  pillar_edge_case?: number | null
  pillar_connection?: number | null
}): HumanPillars | null {
  if (
    p.pillar_liability != null &&
    p.pillar_context != null &&
    p.pillar_edge_case != null &&
    p.pillar_connection != null
  ) {
    return {
      liability: p.pillar_liability,
      context: p.pillar_context,
      edgeCase: p.pillar_edge_case,
      connection: p.pillar_connection,
    }
  }
  return null
}

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
    <span className={`inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full transition-all ${isAnimating ? 'scale-110' : 'scale-100'
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

  // Strategy data from upgrade_paths (primary_pillar from AI hvq_analysis when available)
  const [strategyData, setStrategyData] = useState<{
    role: string | null
    main_goal: string | null
    context: string | null
    primary_pillar: string | null
  }>({
    role: null,
    main_goal: null,
    context: null,
    primary_pillar: null
  })

  // Human Pillars from upgrade_paths (pillar_liability, pillar_context, pillar_edge_case, pillar_connection)
  // Set by n8n AI audit; used by calculateVulnerability. Null until AI provides them.
  const [pathPillars, setPathPillars] = useState<HumanPillars | null>(null)

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
  const [editingHoursIndex, setEditingHoursIndex] = useState<number | null>(null)

  // Edit Strategy Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // Listen for mobile header edit button click
  useEffect(() => {
    const handleOpenEditDialog = () => {
      setEditDialogOpen(true)
    }
    window.addEventListener('openEditDialog', handleOpenEditDialog)
    return () => window.removeEventListener('openEditDialog', handleOpenEditDialog)
  }, [])

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
      const supabase = createClient()

      // Get current user for ownership check
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      // STEP 1: Fetch profile by username from URL
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, full_name, username, is_organization, organization_name")
        .eq("username", username)
        .maybeSingle()

      // Profile fetch completed

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

      // Helper function to check if a string is a UUID
      const isUUID = (str: string): boolean => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        return uuidRegex.test(str)
      }

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
              hvq_score_human,
              hvq_primary_pillar
            )
          )
        `)
        .eq("slug", slug)
        .eq("user_id", profile.user_id)
        .maybeSingle()

      // Path fetch by slug completed

      // If path not found by slug AND slug looks like a UUID (path ID), try fetching by ID instead
      // This handles the case where slug is NULL in the database
      if ((!path || pathError) && isUUID(slug)) {
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
              hvq_score_human,
              hvq_primary_pillar
            )
          )
          `)
          .eq("id", slug)
          .eq("user_id", profile.user_id)
          .maybeSingle()

        // Path fetch by ID completed

        if (pathById && !pathByIdError) {
          path = pathById
          pathError = null
        } else {
          pathError = pathByIdError || pathError
        }
      }

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
      // Hoist so efficiency_audit block can pass them into calculateHVQScore
      let pathResourcesMap: Record<string, string> = {}
      let pathResourceWeightsMap: Record<string, number> = {}
      let pathResourcesListBuilt: { ai_tools: ResourceItem[]; human_courses: ResourceItem[] } = { ai_tools: [], human_courses: [] }

      // Parse n8n-generated data from JSON blobs
      // n8n stores data in upgrade_paths.ai_tools and upgrade_paths.human_courses JSON columns
      // Schema: ai_tools = [{ id, title, description, url, capabilities, difficulty_level }, ...]
      // Schema: human_courses = [{ id, title, description, url, hvq_primary_pillar }, ...]
      let n8nTools: N8NAITool[] = []
      let n8nCourses: N8NHumanCourse[] = []

      try {
        if (path.ai_tools) {
          const parsed = typeof path.ai_tools === 'string'
            ? JSON.parse(path.ai_tools)
            : path.ai_tools
          n8nTools = Array.isArray(parsed) ? parsed : []
        }
      } catch (e) {
        n8nTools = []
      }

      try {
        if (path.human_courses) {
          const parsed = typeof path.human_courses === 'string'
            ? JSON.parse(path.human_courses)
            : path.human_courses
          n8nCourses = Array.isArray(parsed) ? parsed : []
        }
      } catch (e) {
        n8nCourses = []
      }

      // Create maps for quick lookup: resource_id -> n8n data
      // Note: n8n schema uses 'title', database uses 'name' - we'll map title to ResourceItem.title
      const n8nToolData: Record<string, N8NAITool> = {}
      n8nTools.forEach((tool: N8NAITool) => {
        // Match by id field in the JSON blob (can be null, so check)
        if (tool && tool.id) {
          n8nToolData[tool.id] = tool
        }
      })

      const n8nCourseData: Record<string, N8NHumanCourse> = {}
      n8nCourses.forEach((course: N8NHumanCourse) => {
        // Match by id field in the JSON blob (can be null, so check)
        if (course && course.id) {
          n8nCourseData[course.id] = course
        }
      })

      if (path.path_resources && Array.isArray(path.path_resources)) {
        const visiblePathResources = (path.path_resources || []).filter(
          (pr: any) => pr.status !== 'removed'
        )
        const aiTools: ResourceItem[] = []
        const humanCourses: ResourceItem[] = []

        visiblePathResources.forEach((pr: any) => {
          const resource = pr.resources
          if (resource && resource.id) {
            pathResourcesMap[resource.id] = pr.status
            pathResourceWeightsMap[resource.id] = pr.impact_weight || 0

            // Use n8n-generated data if available, otherwise fallback to resource data
            // Match by resource.id (from path_resources) to tool.id/course.id (from n8n JSON blob)
            // Remapping: n8n schema uses 'title', database uses 'name' - prefer n8n title if available
            const n8nData = resource.type === "ai_tool"
              ? n8nToolData[resource.id]
              : n8nCourseData[resource.id]

            // For AI tools: use n8n title/description/capabilities, fallback to database name/description
            // For courses: use n8n title/description/hvq_primary_pillar, fallback to database name/description
            const title = n8nData?.title || resource.name || ""
            const description = n8nData?.description || resource.description || ""

            // Capabilities only exist for AI tools (not human courses per n8n schema)
            const capabilities = resource.type === "ai_tool" && n8nData
              ? (n8nData as N8NAITool).capabilities
              : resource.capabilities

            const resourceItem: ResourceItem = {
              id: resource.id,
              title: title,
              description: description,
              url: n8nData?.url || resource.url,
              logodev: resource.logodev,
              capabilities: capabilities,
              difficulty_level: resource.type === "ai_tool" && n8nData
                ? (n8nData as N8NAITool).difficulty_level
                : resource.difficulty_level,
              hvq_score_machine: resource.hvq_score_machine,
              hvq_score_human: resource.hvq_score_human,
              hvq_primary_pillar: resource.type === "human_course" && n8nData
                ? (n8nData as N8NHumanCourse).hvq_primary_pillar
                : resource.hvq_primary_pillar,
              paid_count: resource.paid_count,
              completion_count: resource.completion_count,
              enrollment_count: resource.enrollment_count,
            }
            if (resource.type === "ai_tool") aiTools.push(resourceItem)
            else if (resource.type === "human_course") humanCourses.push(resourceItem)
          }
        })

        pathResourcesListBuilt = { ai_tools: aiTools, human_courses: humanCourses }
        setPathResources(pathResourcesMap)
        setPathResourceWeights(pathResourceWeightsMap)
        setPathResourcesList(pathResourcesListBuilt)
      }

      // Note: path_resources is now the single source of truth
      // We don't need to fetch a separate userStackStatus - pathResources state already contains the status

      // If not owner and not public, show 404
      if (!ownerCheck && !path.is_public) {
        setState("error")
        setErrorMessage("This strategy is private")
        return
      }

      // Store strategy data and Human Pillars (from AI hvq_analysis via n8n)
      setStrategyData({
        role: path.role || null,
        main_goal: path.main_goal || null,
        context: path.context || null,
        primary_pillar: path.primary_pillar || null
      })
      setPathPillars(buildPillars(path))

      const pathTitleValue = path.path_title || path.main_goal || "Untitled Path"
      setPathTitle(pathTitleValue)
      setCurrentHvqScore(path.current_hvq_score || null)

      // Check if path_title is still 'Untitled Path' - show loading state
      if (pathTitleValue === "Untitled Path") {
        if (ownerCheck) {
          setState("analyzing")
          setIsPolling(true)
        } else {
          setState("error")
          setErrorMessage("Path is not ready yet")
        }
        return
      }

      // Check if slug changed (UUID to title-based) and redirect if needed
      // Only redirect if slug exists and is different from current slug and not the path ID
      if (path.slug && path.slug !== slug && path.slug !== path.id) {
        // Slug was updated to title-based, redirect to new URL
        router.replace(`/u/${username}/${path.slug}`)
        return
      }

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
            current_hvq_score: path.current_hvq_score || null,
            updated_at: path.updated_at ?? null
          }

          // Path data prepared successfully

          // Always use calculated score for UI; persist it in upgradeData for decay comparison and future saves.
          const vulnerability = calculateVulnerability(path.role || "", buildPillars(path) ?? DEFAULT_PILLARS)
          const primaryPillar = path.primary_pillar || GOAL_PILLAR_MAP[path.role || ""]
          const hvqScore = calculateHVQScore(pathData, pathResourcesListBuilt, pathResourceWeightsMap, vulnerability, pathResourcesMap, primaryPillar, path.updated_at)

          setUpgradeData({
            ...pathData,
            current_hvq_score: hvqScore
          })
          setCurrentHvqScore(hvqScore)

          setState("results")
          setIsPolling(false)
        } catch (error) {
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
              hvq_score_human,
              hvq_primary_pillar
            )
          )
        `)
        .eq("id", pathId)
        .maybeSingle()

      if (!error && upgradePath && upgradePath.efficiency_audit) {
        try {
          setPathPillars(buildPillars(upgradePath))
          setStrategyData((prev) => ({ ...prev, primary_pillar: upgradePath.primary_pillar || prev.primary_pillar || null }))

          const efficiency = typeof upgradePath.efficiency_audit === 'string'
            ? JSON.parse(upgradePath.efficiency_audit)
            : upgradePath.efficiency_audit

          const immediateSteps = typeof upgradePath.immediate_steps === 'string'
            ? JSON.parse(upgradePath.immediate_steps)
            : upgradePath.immediate_steps

          let pollPathResourcesMap: Record<string, string> = {}
          let pollPathResourceWeightsMap: Record<string, number> = {}
          let pollPathResourcesListBuilt: { ai_tools: ResourceItem[]; human_courses: ResourceItem[] } = { ai_tools: [], human_courses: [] }

          // Parse n8n-generated descriptions from JSON blobs
          let pollN8nTools: any[] = []
          let pollN8nCourses: any[] = []

          try {
            if (upgradePath.ai_tools) {
              pollN8nTools = typeof upgradePath.ai_tools === 'string'
                ? JSON.parse(upgradePath.ai_tools)
                : upgradePath.ai_tools
              if (!Array.isArray(pollN8nTools)) pollN8nTools = []
            }
          } catch (e) {
            pollN8nTools = []
          }

          try {
            if (upgradePath.human_courses) {
              pollN8nCourses = typeof upgradePath.human_courses === 'string'
                ? JSON.parse(upgradePath.human_courses)
                : upgradePath.human_courses
              if (!Array.isArray(pollN8nCourses)) pollN8nCourses = []
            }
          } catch (e) {
            pollN8nCourses = []
          }

          // Create maps for quick lookup: resource_id -> n8n data
          const pollN8nToolData: Record<string, N8NAITool> = {}
          pollN8nTools.forEach((tool: N8NAITool) => {
            if (tool && tool.id) {
              pollN8nToolData[tool.id] = tool
            }
          })

          const pollN8nCourseData: Record<string, N8NHumanCourse> = {}
          pollN8nCourses.forEach((course: N8NHumanCourse) => {
            if (course && course.id) {
              pollN8nCourseData[course.id] = course
            }
          })

          // Process path_resources first so we have status/weights for calculateHVQScore
          if (upgradePath.path_resources && Array.isArray(upgradePath.path_resources)) {
            const visiblePathResources = (upgradePath.path_resources || []).filter(
              (pr: any) => pr.status !== 'removed'
            )
            const aiTools: ResourceItem[] = []
            const humanCourses: ResourceItem[] = []

            visiblePathResources.forEach((pr: any) => {
              const resource = pr.resources
              if (resource && resource.id) {
                pollPathResourcesMap[resource.id] = pr.status
                pollPathResourceWeightsMap[resource.id] = pr.impact_weight || 0

                // Use n8n-generated data if available, otherwise fallback to resource data
                // Remapping: n8n schema uses 'title', database uses 'name' - prefer n8n title if available
                const pollN8nData = resource.type === "ai_tool"
                  ? pollN8nToolData[resource.id]
                  : pollN8nCourseData[resource.id]

                // For AI tools: use n8n title/description/capabilities, fallback to database name/description
                // For courses: use n8n title/description/hvq_primary_pillar, fallback to database name/description
                const title = pollN8nData?.title || resource.name || ""
                const description = pollN8nData?.description || resource.description || ""

                // Capabilities only exist for AI tools (not human courses per n8n schema)
                const capabilities = resource.type === "ai_tool" && pollN8nData
                  ? (pollN8nData as N8NAITool).capabilities
                  : resource.capabilities

                const resourceItem: ResourceItem = {
                  id: resource.id,
                  title: title,
                  description: description,
                  url: pollN8nData?.url || resource.url,
                  logodev: resource.logodev,
                  capabilities: capabilities,
                  difficulty_level: resource.type === "ai_tool" && pollN8nData
                    ? (pollN8nData as N8NAITool).difficulty_level
                    : resource.difficulty_level,
                  hvq_score_machine: resource.hvq_score_machine,
                  hvq_score_human: resource.hvq_score_human,
                  hvq_primary_pillar: resource.type === "human_course" && pollN8nData
                    ? (pollN8nData as N8NHumanCourse).hvq_primary_pillar
                    : resource.hvq_primary_pillar,
                  paid_count: resource.paid_count,
                  completion_count: resource.completion_count,
                  enrollment_count: resource.enrollment_count,
                }
                if (resource.type === "ai_tool") aiTools.push(resourceItem)
                else if (resource.type === "human_course") humanCourses.push(resourceItem)
              }
            })
            pollPathResourcesListBuilt = { ai_tools: aiTools, human_courses: humanCourses }
            setPathResources(pollPathResourcesMap)
            setPathResourceWeights(pollPathResourceWeightsMap)
            setPathResourcesList(pollPathResourcesListBuilt)
          }

          const pathData = {
            efficiency_audit: efficiency,
            immediate_steps: immediateSteps,
            current_hvq_score: upgradePath.current_hvq_score ?? null,
            updated_at: upgradePath.updated_at ?? null
          }

          const pillars = buildPillars(upgradePath) ?? DEFAULT_PILLARS
          const vulnerability = calculateVulnerability(upgradePath.role || "", pillars)
          const primaryPillar = upgradePath.primary_pillar || GOAL_PILLAR_MAP[upgradePath.role || ""]
          const hvqScore = calculateHVQScore(pathData, pollPathResourcesListBuilt, pollPathResourceWeightsMap, vulnerability, pollPathResourcesMap, primaryPillar, upgradePath.updated_at)

          setUpgradeData({
            ...pathData,
            current_hvq_score: hvqScore
          })
          setCurrentHvqScore(hvqScore)
          setState("results")
          setIsPolling(false)
        } catch (e) {
          // Continue polling if parsing fails
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

  // Auto-complete Step 1 when a tool is added (added_paid or added_free)
  useEffect(() => {
    if (!upgradeData?.immediate_steps || !isOwner || !pathResourcesList?.ai_tools) return

    // Check if any tool is added (added_paid or added_free)
    const hasAddedTool = pathResourcesList.ai_tools.some((tool: ResourceItem) => {
      if (!tool.id) return false
      const status = pathResources[tool.id] || 'suggested'
      return status === 'added_paid' || status === 'added_free'
    })

    if (hasAddedTool) {
      // Find Step 1 that mentions "Add a tool" or "Add tool"
      const step1Index = upgradeData.immediate_steps.findIndex((step: ImmediateStepItem) =>
        step.text.toLowerCase().includes('add') &&
        (step.text.toLowerCase().includes('tool') || step.text.toLowerCase().includes('ai'))
      )

      if (step1Index >= 0 && !upgradeData.immediate_steps[step1Index].is_completed) {
        const updatedSteps = upgradeData.immediate_steps.map((step: ImmediateStepItem, i: number) =>
          i === step1Index ? { ...step, is_completed: true } : step
        )
        const updatedData = {
          ...upgradeData,
          immediate_steps: updatedSteps
        }
        const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
        const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
        const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights, v, pathResources, pp, upgradeData.updated_at)
        const savedAt = new Date().toISOString()
        setUpgradeData({ ...updatedData, current_hvq_score: newScore, updated_at: savedAt })
        setCurrentHvqScore(newScore)

        // Save to database - use the updatePathInSupabase function defined below
        const saveStep1 = async () => {
          try {
            const supabase = createClient()
            const { error } = await supabase
              .from("upgrade_paths")
              .update({
                immediate_steps: updatedSteps,
                current_hvq_score: newScore,
                updated_at: savedAt
              })
              .eq("id", pathId)

            if (error) throw error
          } catch (error) {
            // Continue - step auto-completion is optional
          }
        }
        saveStep1()
      }
    }
  }, [pathResourcesList?.ai_tools, pathResources, upgradeData, isOwner, pathPillars, strategyData.role, strategyData.primary_pillar, pathResourceWeights, pathId])

  const handleStrategyUpdate = async () => {
    if (pathId) {
      const supabase = createClient()
      const { data: updatedPath } = await supabase
        .from("upgrade_paths")
        .select("role, main_goal, context, primary_pillar")
        .eq("id", pathId)
        .maybeSingle()

      if (updatedPath) {
        setStrategyData({
          role: updatedPath.role || null,
          main_goal: updatedPath.main_goal || null,
          context: updatedPath.context || null,
          primary_pillar: updatedPath.primary_pillar ?? strategyData.primary_pillar ?? null
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

      // Fetch current_hvq_score for rotation to previous_hvq_score
      const { data: currentPath } = await supabase
        .from("upgrade_paths")
        .select("current_hvq_score")
        .eq("id", pathId)
        .single()

      const previousScore = currentPath?.current_hvq_score ?? null

      const currentEfficiencyAudit = upgradeData?.efficiency_audit || {}
      const updatedEfficiencyAudit = {
        delegate_to_machine: updatedData.efficiency_audit?.delegate_to_machine ?? currentEfficiencyAudit.delegate_to_machine ?? [],
        keep_for_human: updatedData.efficiency_audit?.keep_for_human ?? currentEfficiencyAudit.keep_for_human ?? []
      }

      const newScore = updatedData.current_hvq_score ?? (() => {
        const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
        const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
        return calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights, v, pathResources, pp, updatedData.updated_at)
      })()

      const payload = {
        immediate_steps: updatedData.immediate_steps ?? [],
        efficiency_audit: updatedEfficiencyAudit,
        previous_hvq_score: previousScore,
        current_hvq_score: newScore,
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
      throw error
    }
  }

  const handleUpdateDelegateHours = async (index: number, hours: number) => {
    if (!upgradeData?.efficiency_audit?.delegate_to_machine || !isOwner) return

    const updatedDelegateList = (upgradeData.efficiency_audit?.delegate_to_machine || []).map((item, i) =>
      i === index ? { ...item, hours_per_week: hours || undefined } : item
    )

    const updatedEfficiencyAudit = {
      ...upgradeData.efficiency_audit,
      delegate_to_machine: updatedDelegateList
    }

    const updatedData: UpgradePathData = {
      ...upgradeData,
      efficiency_audit: updatedEfficiencyAudit
    }

    try {
      await updatePathInSupabase(updatedData)
      setUpgradeData(updatedData)
      router.refresh()
    } catch (error) {
      // Continue - hours update is optional
    }
  }

  const handleToggleKeepForHuman = async (index: number) => {
    if (!upgradeData?.efficiency_audit?.keep_for_human || !isOwner) return

    // Check if at least one course is added_completed (validation)
    const hasCompletedCourses = (pathResourcesList?.human_courses || []).some((course: ResourceItem) => {
      if (!course.id) return false
      const courseStatus = pathResources[course.id] || 'suggested'
      return courseStatus === 'added_completed'
    })

    if (!hasCompletedCourses) {
      // Don't allow toggling if no completed courses
      return
    }

    const previousData = upgradeData
    const wasFortified = keepForHuman[index]?.is_fortified || false
    // Toggle is_fortified (for Human Mastery Bonus calculation)
    // Also maintain is_completed for UI display
    const updatedKeepForHumanList = keepForHuman.map((item, i) => {
      if (i === index) {
        const newIsFortified = !item.is_fortified
        return { 
          task: item.task, 
          is_completed: newIsFortified, // Sync with is_fortified for UI
          is_fortified: newIsFortified 
        }
      }
      return item
    })

    // Store as objects with completion state (always objects now)
    const updatedEfficiencyAudit = {
      ...upgradeData.efficiency_audit,
      keep_for_human: updatedKeepForHumanList
    }

    const updatedData = {
      ...upgradeData,
      efficiency_audit: updatedEfficiencyAudit
    }

    const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
    const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
    const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights, v, pathResources, pp, updatedData.updated_at)
    const savedAt = new Date().toISOString()
    setUpgradeData({ ...updatedData, current_hvq_score: newScore, updated_at: savedAt })
    
    // Trigger animation if task was just fortified (not unfortified)
    if (!wasFortified && updatedKeepForHumanList[index]?.is_fortified) {
      setCurrentHvqScore(newScore)
    } else {
      setCurrentHvqScore(newScore)
    }

    try {
      await updatePathInSupabase(updatedData)
      router.refresh()
    } catch (error) {
      setUpgradeData(previousData)
    }
  }

  const handleToggleDelegate = async (index: number) => {
    if (!upgradeData?.efficiency_audit?.delegate_to_machine || !isOwner) return

    const previousData = upgradeData
    const wasCompleted = upgradeData.efficiency_audit.delegate_to_machine[index]?.is_completed
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

    const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
    const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
    const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights, v, pathResources, pp, updatedData.updated_at)
    const savedAt = new Date().toISOString()
    setUpgradeData({ ...updatedData, current_hvq_score: newScore, updated_at: savedAt })

    // Trigger animation if task was just completed (not uncompleted)
    if (!wasCompleted && updatedDelegateList[index]?.is_completed) {
      setCurrentHvqScore(newScore)

      // Auto-complete Step 2 if it mentions "Automate" or "Delegate"
      if (upgradeData?.immediate_steps) {
        const step2Index = upgradeData.immediate_steps.findIndex((step: ImmediateStepItem) =>
          step.text.toLowerCase().includes('automate') ||
          step.text.toLowerCase().includes('delegate') ||
          step.text.toLowerCase().includes('task')
        )
        if (step2Index >= 0 && !upgradeData.immediate_steps[step2Index].is_completed) {
          const updatedSteps = upgradeData.immediate_steps.map((step: ImmediateStepItem, i: number) =>
            i === step2Index ? { ...step, is_completed: true } : step
          )
          const dataWithStep2 = {
            ...updatedData,
            immediate_steps: updatedSteps
          }
          const step2Score = calculateHVQScore(dataWithStep2, pathResourcesList, pathResourceWeights, v, pathResources, pp, savedAt)
          setUpgradeData({ ...dataWithStep2, current_hvq_score: step2Score, updated_at: savedAt })
          setCurrentHvqScore(step2Score)
          try {
            await updatePathInSupabase({ ...dataWithStep2, current_hvq_score: step2Score })
          } catch (error) {
            // Continue - step auto-completion is optional
          }
        }
      }
    } else {
      setCurrentHvqScore(newScore)
    }

    try {
      await updatePathInSupabase({ ...updatedData, current_hvq_score: newScore })
    } catch (error) {
      setUpgradeData(previousData)
    }
  }

  const handleToggleStep = async (index: number) => {
    if (!upgradeData?.immediate_steps || !isOwner) return

    const previousData = upgradeData
    const wasCompleted = upgradeData.immediate_steps[index]?.is_completed
    const updatedSteps = (upgradeData.immediate_steps || []).map((step, i) =>
      i === index ? { ...step, is_completed: !step.is_completed } : step
    )

    const updatedData = {
      ...upgradeData,
      immediate_steps: updatedSteps
    }

    const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
    const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
    const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights, v, pathResources, pp, updatedData.updated_at)
    const savedAt = new Date().toISOString()
    setUpgradeData({ ...updatedData, current_hvq_score: newScore, updated_at: savedAt })

    // Trigger animation if step was just completed (not uncompleted)
    if (!wasCompleted && updatedSteps[index]?.is_completed) {
      // Animation will be handled by ScoreBadge component when currentHvqScore changes
      setCurrentHvqScore(newScore)
    } else {
      setCurrentHvqScore(newScore)
    }

    try {
      await updatePathInSupabase({ ...updatedData, current_hvq_score: newScore })
    } catch (error) {
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

    const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
    const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
    const newScore = calculateHVQScore(updatedData, pathResourcesList, pathResourceWeights, v, pathResources, pp, updatedData.updated_at)
    const savedAt = new Date().toISOString()
    setUpgradeData({ ...updatedData, current_hvq_score: newScore, updated_at: savedAt })
    setCurrentHvqScore(newScore)
    setNewStepText("")

    try {
      await updatePathInSupabase({ ...updatedData, current_hvq_score: newScore })
    } catch (error) {
      setUpgradeData(previousData)
    }
  }

  const handleRemoveStep = async (index: number) => {
    // TODO: Implement backend and database update
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
  const keepForHumanRaw = upgradeData?.efficiency_audit?.keep_for_human || []
  // Convert keepForHuman to objects with completion/fortified state (always objects now)
  // Support legacy string format for backward compatibility during migration
  const keepForHuman = keepForHumanRaw.map((item: string | { task: string; is_completed?: boolean; is_fortified?: boolean }) => {
    if (typeof item === 'string') {
      return { task: item, is_completed: false, is_fortified: false }
    }
    return { 
      task: item.task, 
      is_completed: item.is_completed || false,
      is_fortified: item.is_fortified || false
    }
  })
  const immediateSteps = upgradeData?.immediate_steps || []

  const displayName = profileData?.is_organization && profileData?.organization_name
    ? profileData.organization_name
    : profileData?.full_name || username

  // Calculate path-specific metrics
  const stepsCompleted = (immediateSteps || []).filter((step: ImmediateStepItem) => step.is_completed === true).length

  // Calculate "Time Saved" - sum of hours_per_week for completed tasks
  const timeSavedHours = delegateToMachine
    .filter((task: DelegateTaskItem) => {
      // Only count hours for tasks that are completed (delegated)
      return task.is_completed && task.hours_per_week && task.hours_per_week > 0
    })
    .reduce((sum: number, task: DelegateTaskItem) => {
      return sum + (task.hours_per_week || 0)
    }, 0)

  // Calculate Skills count - courses that are added (added_enrolled, added_completed) or wishlisted
  const skillsCount = (pathResourcesList?.human_courses || []).filter((course: ResourceItem) => {
    if (!course.id) return false
    const courseStatus = pathResources[course.id] || 'suggested'
    return courseStatus === 'added_enrolled' ||
      courseStatus === 'added_completed' ||
      courseStatus === 'wishlisted'
  }).length

  // Replacement Risk / decay UI: vulnerability, primaryPillar, calculated score, delegation bonus %
  const initialVulnerability = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
  const pathVulnerability = initialVulnerability // Keep for backward compatibility
  const primaryPillar = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]

  // Calculate Replacement Risk with Human Gate logic
  const totalTasks = delegateToMachine.length
  const completedTasks = delegateToMachine.filter((task: DelegateTaskItem) => task.is_completed).length
  const uncompletedTasks = totalTasks - completedTasks

  // Start with initial vulnerability
  let currentRisk = initialVulnerability

  // Reduce risk based on task completion ratio
  // Each completed task reduces risk proportionally
  const taskCompletionRatio = totalTasks > 0 ? completedTasks / totalTasks : 0
  currentRisk = currentRisk * (1 - taskCompletionRatio)

  // Count completed courses
  const completedCourses = (pathResourcesList?.human_courses || []).filter((course: ResourceItem) => {
    if (!course.id) return false
    const courseStatus = pathResources[course.id] || 'suggested'
    return courseStatus === 'added_completed'
  }).length

  // Verified Progress Gates
  // Automation Gate: Check if user has at least one AI tool with status 'added_paid' or 'added_free'
  const hasAddedTools = (pathResourcesList?.ai_tools || []).some((tool: ResourceItem) => {
    if (!tool.id) return false
    const toolStatus = pathResources[tool.id] || 'suggested'
    return toolStatus === 'added_paid' || toolStatus === 'added_free'
  })

  // Human Gate: Check if user has at least one completed course
  const hasCompletedCourses = completedCourses > 0

  // Further reduce risk based on completed courses
  // Each completed course reduces risk by an additional 10% (capped)
  const courseReduction = Math.min(completedCourses * 0.1, 0.5) // Max 50% reduction from courses
  currentRisk = currentRisk * (1 - courseReduction)

  // Human Gate: Minimum 5% residual risk if no courses completed
  // Only allow 0% risk if at least one course is completed
  let isHumanGate = false
  if (completedCourses === 0 && currentRisk < 0.05) {
    currentRisk = 0.05 // 5% Residual Risk (Human Gate)
    isHumanGate = true
  }

  // Ensure risk doesn't go below 0
  currentRisk = Math.max(0, currentRisk)

  const riskPercent = Math.round(currentRisk * 100)
  const isRiskFree = currentRisk === 0 && completedCourses > 0
  const calculatedScore = upgradeData
    ? calculateHVQScore(
      upgradeData,
      pathResourcesList ?? { ai_tools: [], human_courses: [] },
      pathResourceWeights,
      pathVulnerability,
      pathResources,
      primaryPillar,
      upgradeData.updated_at
    )
    : null
  const showDecayWarning =
    upgradeData?.current_hvq_score != null &&
    calculatedScore != null &&
    calculatedScore < upgradeData.current_hvq_score
  // Each completed delegate task reduces risk by 15% (multiplicative)
  const delegationBonusPercent = 15

  // UI must use calculatedScore (live calculateHVQScore), not DB current_hvq_score. Fallback when no upgradeData.
  const displayHvq = calculatedScore ?? currentHvqScore ?? 10

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-6 pt-8 pb-16">

        {/* Header Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1 hidden md:block">
              {isOwner ? (
                <EditablePathTitle
                  pathId={pathId!}
                  initialTitle={pathTitle}
                  onUpdate={(newTitle) => setPathTitle(newTitle)}
                />
              ) : (
                <h1 className="text-xl md:text-2xl font-normal text-zinc-900 dark:text-zinc-50">
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

            {/* Right: Action Buttons (only for owners) - Hidden on mobile */}
            {isOwner && pathId && (
              <div className="hidden md:flex gap-2">
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
                      <span className="hidden sm:inline">Edit Path</span>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {/* HVQ Score */}
            <Card className="p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm md:text-xs text-blue-600 dark:text-blue-400">HVQ Score</div>
                  <InfoTooltip content="Real-time safety rating for this role based on your tools and human skill multipliers." />
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <LayoutDashboard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xl md:text-2xl font-bold text-blue-900 dark:text-blue-100">{displayHvq}</div>
                <div className="w-20 h-8">
                  <svg width="100%" height="32" className="text-blue-600 dark:text-blue-400">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const barHeight = Math.random() * 18 + 6 + Math.max(0, (displayHvq - 10) / 50)
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

            {/* Time Saved */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm md:text-xs text-zinc-500 dark:text-zinc-400">Time Saved</div>
                  <InfoTooltip content="Weekly hours reclaimed from automation to be reinvested in human-centric missions." />
                </div>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{timeSavedHours}h</div>
                <div className="w-20 h-8">
                  <svg width="100%" height="32" className="text-emerald-500">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const barHeight = Math.random() * 16 + 6 + Math.min(timeSavedHours / 8, 8)
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
                <div className="flex items-center gap-1.5">
                  <div className="text-sm md:text-xs text-zinc-500 dark:text-zinc-400">Steps Completed</div>
                  <InfoTooltip content="Tactical progress through your AI-generated implementation blueprint." />
                </div>
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Footprints className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stepsCompleted}</div>
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

            {/* Skills */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm md:text-xs text-zinc-500 dark:text-zinc-400">Skills</div>
                  <InfoTooltip content="Total courses active in this path that provide a 2x bonus to your Primary Pillar." />
                </div>
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <GraduationCap className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{skillsCount}</div>
                <div className="w-20 h-8">
                  <svg width="100%" height="32" className="text-orange-500">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const barHeight = Math.random() * 15 + 6 + (skillsCount * 1.5)
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

          <KnowledgeDecayBanner
            show={showDecayWarning}
            calculatedScore={calculatedScore}
            lastRecordedScore={upgradeData?.current_hvq_score}
            decayRatePercent={Math.round(HVQ_DECAY_RATE * 100)}
          />
        </div>

        {/* Efficiency Audit */}
        <section className="mb-20">
          <h2 className="mb-8 text-xl md:text-2xl font-normal text-black dark:text-zinc-50">
            Efficiency Audit
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Delegate to Machine */}
            <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 mb-2">
                  <CardTitle className="text-xl font-semibold text-emerald-900 dark:text-emerald-400">
                    Delegate to Machine
                  </CardTitle>
                  <ReplacementRiskPill
                    riskPercent={riskPercent}
                    isRiskFree={isRiskFree}
                    isHumanGate={isHumanGate}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 text-zinc-700 dark:text-zinc-300">
                  {delegateToMachine.length > 0 ? (
                    delegateToMachine.map((item, index) => {
                      const isLocked = !hasAddedTools
                      return (
                        <li key={index} className="flex items-start gap-3">
                          {isOwner ? (
                            <div className="flex-1">
                              <div className="flex items-start gap-3">
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <Checkbox
                                          checked={item.is_completed}
                                          onCheckedChange={() => handleToggleDelegate(index)}
                                          disabled={isLocked}
                                          className="mt-0.5"
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    {isLocked && (
                                      <TooltipContent
                                        side="right"
                                        align="center"
                                        sideOffset={8}
                                        className="max-w-xs text-xs leading-relaxed"
                                      >
                                        Add an AI Tool to your stack to unlock this automation.
                                      </TooltipContent>
                                    )}
                                    {!isLocked && !item.is_completed && (
                                      <TooltipContent
                                        side="right"
                                        align="center"
                                        sideOffset={8}
                                        className="max-w-xs text-xs leading-relaxed"
                                      >
                                        Completing this will reduce your Replacement Risk by {delegationBonusPercent}%.
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                                <label
                                  className={`flex-1 ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${item.is_completed
                                    ? "text-zinc-500 dark:text-zinc-500"
                                    : "text-zinc-700 dark:text-zinc-300"
                                    }`}
                                  onClick={() => !isLocked && handleToggleDelegate(index)}
                                >
                                  {isLocked && (
                                    <Lock className="h-3 w-3 inline mr-1 text-zinc-400" />
                                  )}
                                  {item.task}
                                </label>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingHoursIndex(editingHoursIndex === index ? null : index)
                                  }}
                                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                  title="Edit hours"
                                >
                                  {editingHoursIndex === index ? (
                                    <X className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                                  ) : (
                                    <Edit2 className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                                  )}
                                </button>
                              </div>
                              {/* Hours input - indented under task title, hidden by default */}
                              {editingHoursIndex === index && (
                                <div className="ml-8 mt-2 flex items-center gap-2">
                                  <label className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                    Hours/week:
                                  </label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    placeholder="0"
                                    value={item.hours_per_week || ''}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value)
                                      handleUpdateDelegateHours(index, isNaN(value) ? 0 : value)
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onFocus={(e) => e.stopPropagation()}
                                    className="w-20 h-7 text-xs text-center"
                                    autoFocus
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <span className={`mt-0.5 ${item.is_completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                                {item.is_completed ? '✓' : '○'}
                              </span>
                              <div className="flex-1">
                                <span className={`block ${item.is_completed ? 'text-zinc-500 dark:text-zinc-500 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                  {item.task}
                                </span>
                                {item.hours_per_week && item.hours_per_week > 0 && (
                                  <span className="block mt-1 ml-0 text-xs text-zinc-500 dark:text-zinc-400">
                                    {item.hours_per_week} hrs/week
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </li>
                      )
                    })
                  ) : (
                    <li className="text-zinc-500">No items to delegate</li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {/* Right: Keep for Human */}
            <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-950/20">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 mb-2">
                  <CardTitle className="text-xl font-normal text-orange-900 dark:text-orange-400">
                    Keep for Human
                  </CardTitle>
                  {/* Primary Pillar Badge */}
                  {primaryPillar && (
                    <AbsoluteTooltip
                      content="This is your most un-automatable asset. Protect tasks in this category to maximize your HVQ."
                      side="left"
                      className="max-w-xs whitespace-normal"
                    >
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 shadow-sm cursor-help">
                        <Target className="h-3 w-3" />
                        Primary Pillar: {primaryPillar.charAt(0).toUpperCase() + primaryPillar.slice(1)}
                      </span>
                    </AbsoluteTooltip>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 text-zinc-700 dark:text-zinc-300">
                  {keepForHuman.length > 0 ? (
                    keepForHuman.map((item, index) => {
                      const taskText = item.task
                      const isFortified = item.is_fortified || false
                      const isCompleted = item.is_completed || isFortified // Show completed if fortified
                      const isLocked = !hasCompletedCourses

                      return (
                        <li key={index} className="flex items-start gap-3">
                          {isOwner ? (
                            <>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <Checkbox
                                        checked={isFortified}
                                        onCheckedChange={() => handleToggleKeepForHuman(index)}
                                        disabled={isLocked}
                                        className="mt-0.5"
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  {isLocked && (
                                    <TooltipContent
                                      side="right"
                                      align="center"
                                      sideOffset={8}
                                      className="max-w-xs text-xs leading-relaxed"
                                    >
                                      Complete a Pillar-matched course to verify this human skill.
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                              <label
                                className={`flex-1 ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${isFortified
                                  ? "text-zinc-500 dark:text-zinc-500"
                                  : "text-zinc-700 dark:text-zinc-300"
                                  }`}
                                onClick={() => !isLocked && handleToggleKeepForHuman(index)}
                              >
                                <div className="flex items-center gap-2">
                                  {isFortified && (
                                    <Shield className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                  )}
                                  {taskText}
                                </div>
                              </label>
                            </>
                          ) : (
                            <>
                              <span className={`mt-0.5 ${isCompleted ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-400'}`}>
                                {isCompleted ? <Shield className="h-4 w-4" /> : '○'}
                              </span>
                              <span className={`flex-1 ${isCompleted ? 'text-zinc-500 dark:text-zinc-500 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                {taskText}
                              </span>
                            </>
                          )}
                        </li>
                      )
                    })
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
                  <h2 className="text-xl md:text-2xl font-normal text-black dark:text-zinc-50">
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
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
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

                    // Recalculate HVQ score with updated weights (use status map with this tool's new status)
                    const { current_hvq_score: _, ...dataForCalculation } = upgradeData!
                    const statusMap = { ...pathResources, ...(toolId && newStatus ? { [toolId]: newStatus } : {}) }
                    const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
                    const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
                    const newScore = calculateHVQScore(dataForCalculation, pathResourcesList, pathResourceWeights, v, statusMap, pp, upgradeData?.updated_at)
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
                          <CardTitle className="text-base md:text-sm font-semibold">{tool.title}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="mb-2 text-sm text-zinc-500">
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
                            {(tool.paid_count && tool.paid_count > 0) ||
                              (tool.completion_count && tool.completion_count > 0) ||
                              (tool.enrollment_count && tool.enrollment_count > 0) ? (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                                Community Trust
                              </span>
                            ) : null}
                            {tool.url && (
                              <a
                                href={tool.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
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
              <h2 className="text-xl md:text-2xl font-normal text-black dark:text-zinc-50">
                Human Skills
              </h2>
            </div>
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {(pathResourcesList.human_courses || []).map((course, i) => {
                const courseId = course.id
                const pathResourceStatus = courseId ? (pathResources[courseId] || 'suggested') : 'suggested'
                const isRemoved = pathResourceStatus === 'removed'
                const isMoatMatch = !!primaryPillar && !!course.hvq_primary_pillar && course.hvq_primary_pillar === primaryPillar

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

                  // Recalculate HVQ score with updated weights (use status map with this course's new status)
                  const { current_hvq_score: _, ...dataForCalculation } = upgradeData!
                  const statusMap = { ...pathResources, ...(courseId && newStatus ? { [courseId]: newStatus } : {}) }
                  const v = calculateVulnerability(strategyData.role || "", pathPillars ?? DEFAULT_PILLARS)
                  const pp = strategyData.primary_pillar || GOAL_PILLAR_MAP[strategyData.role || ""]
                  const newScore = calculateHVQScore(dataForCalculation, pathResourcesList, pathResourceWeights, v, statusMap, pp, upgradeData?.updated_at)
                  setUpgradeData(prev => prev ? { ...prev, current_hvq_score: newScore } : null)
                  setCurrentHvqScore(newScore)
                  router.refresh()
                }

                return (
                  <Card
                    key={i}
                    className={`relative ${isOwner ? "group transition-all hover:border-purple-200 dark:hover:border-purple-800" : "border-zinc-200 dark:border-zinc-800"} ${isMoatMatch ? "ring-2 ring-orange-600/50 dark:ring-orange-400/50 border-orange-600/50 dark:border-orange-400/50" : ""}`}
                  >
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
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base md:text-sm font-semibold">{course.title}</CardTitle>
                        {isMoatMatch && (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 rounded-full border border-orange-600/50 dark:border-orange-400/50">
                            2× Value
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-3 text-sm text-zinc-500">
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
                          {(course.paid_count && course.paid_count > 0) ||
                            (course.completion_count && course.completion_count > 0) ||
                            (course.enrollment_count && course.enrollment_count > 0) ? (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                              Community Trust
                            </span>
                          ) : null}
                          {course.url && (
                            <a
                              href={course.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
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
            <div className="mb-8 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Footprints className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-xl md:text-2xl font-normal text-black dark:text-zinc-50">
                  Next Steps
                </h2>
              </div>
              {stepsCompleted > 0 && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800">
                  Execution Bonus: +{stepsCompleted * EXECUTION_BONUS_PER_STEP} HVQ
                </span>
              )}
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
              <table className="w-full table-fixed">
                <colgroup>
                  {isOwner && <col className="w-[10%] md:w-[8%]" />}
                  <col className="hidden md:table-column w-[8%]" />
                  <col className="w-[90%] md:w-[75%]" />
                  {isOwner && <col className="w-[9%]" />}
                </colgroup>
                <tbody className="bg-white dark:bg-zinc-950 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {immediateSteps.length > 0 ? (
                    immediateSteps.map((step, i) => (
                      <tr key={i} className={`relative ${step.is_completed ? 'opacity-60' : ''} ${isOwner ? 'hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer group' : ''}`} onClick={() => isOwner && handleToggleStep(i)}>
                        {isOwner && (
                          <td className="pl-3 pr-1 py-3">
                            <div className="flex flex-col items-center gap-4">
                              <Checkbox
                                checked={step.is_completed}
                                onCheckedChange={() => handleToggleStep(i)}
                                onClick={(e) => e.stopPropagation()}
                                className="ml-0"
                              />
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleRemoveStep(i)
                                }}
                                className="md:hidden text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20 rounded p-1 transition-colors"
                                title="Remove step"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="hidden md:table-cell px-1 py-3 relative">
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm md:text-xs font-bold text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            {i + 1}
                          </div>
                        </td>
                        <td className="px-3 py-3 md:pl-6">
                          <p className={`text-base md:text-sm ${step.is_completed
                            ? "line-through text-zinc-500 dark:text-zinc-500"
                            : "text-zinc-700 dark:text-zinc-300"
                            }`}>
                            {step.text}
                          </p>
                        </td>
                        {isOwner && (
                          <td className="px-2 py-3">
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
                      {isOwner && <td className="pl-3 pr-1 py-3"></td>}
                      <td className="hidden md:table-cell px-1 py-3"></td>
                      <td className="px-3 py-3 md:pl-6">
                        <p className="text-base md:text-sm text-zinc-500 dark:text-zinc-400">No steps yet</p>
                      </td>
                      {isOwner && <td className="px-2 py-3"></td>}
                    </tr>
                  )}
                  {isOwner && (
                    <tr className="bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                      {isOwner && <td className="pl-3 pr-1 py-3"></td>}
                      <td className="hidden md:table-cell px-1 py-3 relative">
                        <div className="absolute left-1 top-1/2 -translate-y-1/2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-sm md:text-xs font-bold text-zinc-500 dark:text-zinc-400">
                          +
                        </div>
                      </td>
                      <td className="px-3 py-3 md:pl-6">
                        <form onSubmit={(e) => { e.preventDefault(); handleAddStep(); }} className="w-full">
                          <Input
                            type="text"
                            value={newStepText}
                            onChange={(e) => setNewStepText(e.target.value)}
                            placeholder="Add a new step..."
                            className="w-full"
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
                      {isOwner && <td className="px-2 py-3"></td>}
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
