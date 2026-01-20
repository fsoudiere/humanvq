import { createClient } from "@/utils/supabase/server"
import { ShareButton } from "@/components/share-button"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { BookOpen, Wrench, GraduationCap, CheckCircle2, Clock, ListTodo, Target, Settings, LayoutDashboard, Activity, Bot, Plus } from "lucide-react"
import { Metadata } from "next"
import ResourceIcon from "@/components/resource-icon"
import { Card, CardContent } from "@/components/ui/card"
import TierSection from "@/components/tier-section"
import CourseGroup from "@/components/course-group"
import { PathCard } from "@/components/path-card"

interface PageProps {
  params: Promise<{ username: string }>
}

// Helper function to check if a string is a UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const supabase = await createClient()

  // Try to fetch profile by username first, then by user_id if it's a UUID
  let profile = null
  if (isUUID(username)) {
    // If it's a UUID, fetch by user_id
    const { data } = await supabase
      .from("profiles")
      .select("full_name, is_organization, organization_name")
      .eq("user_id", username)
      .maybeSingle()
    profile = data
  } else {
    // Otherwise, fetch by username
    const { data } = await supabase
      .from("profiles")
      .select("full_name, is_organization, organization_name")
      .eq("username", username)
      .maybeSingle()
    profile = data
  }

  const displayName = profile?.is_organization && profile?.organization_name
    ? profile.organization_name
    : profile?.full_name || username
  const stackLabel = profile?.is_organization ? "Company Stack" : "AI Stack"
  const title = `${displayName}'s ${stackLabel}`
  const description = profile?.is_organization
    ? `Check out ${profile.organization_name}'s public upgrade paths and AI stack.`
    : `Check out ${profile?.full_name || username}'s public upgrade paths and AI stack.`

  return {
    title: title,
    description: description,
    openGraph: {
      title: title,
      description: description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
    }
  }
}

export default async function UnifiedUsernamePage({ params }: PageProps) {
  const { username } = await params
  const supabase = await createClient()

  // STEP 1: Auth First - Always get current user from auth first
  const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

  // STEP 2: Fetch profile by username or user_id (UUID fallback)
  let profile = null
  let targetUserId: string | null = null

  if (isUUID(username)) {
    // If it's a UUID, fetch by user_id
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, username, is_organization, organization_name")
      .eq("user_id", username)
      .maybeSingle()
    profile = data
    targetUserId = username
  } else {
    // Otherwise, fetch by username
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, username, is_organization, organization_name")
      .eq("username", username)
      .maybeSingle()
    profile = data
    targetUserId = profile?.user_id || null
  }

  // If profile doesn't exist, show 404
  if (!profile || !targetUserId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h1 className="text-2xl font-bold mb-4">User Not Found</h1>
        <p className="text-zinc-500 mb-6">The user with username "{username}" could not be found.</p>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    )
  }

  // STEP 3: Ownership Check
  const isOwner = currentUser?.id === profile.user_id

  // STEP 4: Fetch upgrade_paths for Global Human Moat Score and Path cards (including efficiency_audit for metrics)
  const { data: pathsData, error: pathsError } = await supabase
    .from("upgrade_paths")
    .select("*")
    .eq("user_id", targetUserId)
    .order('created_at', { ascending: false })

  const paths = pathsData || []

  // STEP 5: Fetch path_resources directly (single source of truth)
  // Query by user_id to get all resources across all paths
  const { data: allPathResourcesRaw, error: pathResourcesError } = await supabase
    .from("path_resources")
    .select(`
      *,
      resource:resources (
        id, name, description, url, logodev, capabilities, type
      ),
      upgrade_paths (
        id,
        path_title,
        main_goal,
        slug
      )
    `)
    .eq("user_id", targetUserId)
    .neq("status", "removed") // Exclude removed resources at query level

  // Filter out "suggested" status - resources with status "suggested" should not appear on profile
  // They only appear after user explicitly adds them (status changes to wishlisted/active/etc)
  const allPathResources = (allPathResourcesRaw || []).filter(
    (pr: any) => pr.status !== "suggested"
  )

  // Debug log to see if data is being returned
  console.log('Path Resources found for user:', allPathResources?.length || 0)

  if (pathResourcesError) {
    console.error("Error fetching path_resources:", {
      message: pathResourcesError.message,
      details: pathResourcesError.details,
      hint: pathResourcesError.hint,
      code: pathResourcesError.code,
      fullError: pathResourcesError
    })
  }

  // STEP 6: Filter out null resources and deduplicate
  // Remove items where resource is null (deleted from library)
  const validPathResources = (allPathResources || []).filter((pr: any) => {
    return pr.resource !== null && pr.resource_id !== null
  })

  console.log('Valid Path Resources (after null filter):', validPathResources.length)

  // Simplified deduplication - just group by resource_id and collect all paths
  // Use the first status found (simplified from priority logic)
  const resourceMap: Record<string, {
    resource: any
    status: string
    paths: Array<{ id: string; title: string; slug: string }>
  }> = {}

  // Process all valid path_resources to build complete resource map with all paths
  validPathResources.forEach((pr: any) => {
    const resourceId = pr.resource_id
    const resource = pr.resource // Note: using 'resource' alias from select
    const path = pr.upgrade_paths

    if (!resource || !resourceId) return

    if (!resourceMap[resourceId]) {
      // First occurrence of this resource - use this status
      resourceMap[resourceId] = {
        resource,
        status: pr.status,
        paths: []
      }
    }

    // Add path to the list (avoid duplicates)
    if (path) {
      const pathExists = resourceMap[resourceId].paths.some(p => p.id === path.id)
      if (!pathExists) {
        resourceMap[resourceId].paths.push({
          id: path.id,
          title: path.path_title || path.main_goal || "Untitled Path",
          slug: path.slug || path.id
        })
      }
    }
  })

  // STEP 7: Convert map to array format matching existing structure
  // Keep database statuses as-is (added_paid, added_free, added_enrolled, added_completed, wishlisted, removed, suggested)
  // These statuses have impact_weight used in score calculations - don't map them
  const stack = Object.values(resourceMap).map((item) => ({
    status: item.status, // Keep database status (added_paid, added_free, added_enrolled, added_completed, wishlisted, removed, suggested)
    resource: item.resource,
    paths: item.paths
  }))

  console.log('Final stack items:', stack.length)
  console.log('Stack items with statuses:', stack.map((s: any) => ({
    name: s.resource?.name,
    status: s.status,
    originalStatus: resourceMap[s.resource?.id]?.status
  })))

  // Get username for unified routes (use profile username or fallback to user_id)
  const displayUsername = profile.username || targetUserId

  // STEP 5: Fail-Safe - If profile is null but we have auth user, use user metadata
  // Only use this for display purposes when viewing own stack
  let displayProfile: any = profile

  if (!profile && isOwner && currentUser) {
    // Create a fallback profile object from user metadata only if profile doesn't exist
    displayProfile = {
      full_name: currentUser.user_metadata?.full_name ||
        currentUser.user_metadata?.name ||
        currentUser.email?.split('@')[0] ||
        "User",
      is_organization: false,
      organization_name: null,
      user_id: currentUser.id,
      username: null
    }
  }

  // Handle Empty State
  if (stack.length === 0 && paths.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h1 className="text-2xl font-bold mb-4">Empty Stack 📭</h1>
        <p className="text-zinc-500 mb-6">This {profile?.is_organization ? "organization" : "user"} hasn't curated their AI stack yet.</p>
        {isOwner && (
          <Link href={`/u/${displayUsername}/create`}>
            <Button>{profile?.is_organization ? "Generate Company Stack" : "Generate My Stack"}</Button>
          </Link>
        )}
      </div>
    )
  }

  // --- SEPARATE & GROUP DATA ---

  // Split into Arrays
  const courses = stack.filter((i: any) => i.resource?.type === 'human_course')
  const tools = stack.filter((i: any) => i.resource?.type !== 'human_course')

  console.log('Tools count:', tools.length, 'Courses count:', courses.length)
  console.log('Tool statuses:', tools.map((t: any) => ({ name: t.resource?.name, status: t.status })))
  console.log('Course statuses:', courses.map((c: any) => ({ name: c.resource?.name, status: c.status })))

  // Group Tools using database statuses:
  // - added_paid: tool is added with paid tier
  // - added_free: tool is added with free tier
  // - wishlisted: tool is wishlisted (shared status)
  // Note: removed and suggested are already filtered out above
  const payingTools = tools.filter((i: any) => i.status === 'added_paid')
  const freeTools = tools.filter((i: any) => i.status === 'added_free')
  const wishlistTools = tools.filter((i: any) => i.status === 'wishlisted')

  // Catch-all for any unmapped tool statuses (should not happen with proper status management)
  // Exclude removed and suggested - these should not appear on profile
  const otherTools = tools.filter((i: any) =>
    i.status !== 'added_paid' &&
    i.status !== 'added_free' &&
    i.status !== 'wishlisted' &&
    i.status !== 'removed' &&
    i.status !== 'suggested'
  )

  // Group Courses using database statuses:
  // - added_enrolled: course is enrolled/in progress
  // - added_completed: course is completed
  // - wishlisted: course is wishlisted (shared status, displayed as "todo" in UI)
  // Note: removed and suggested are already filtered out above
  const enrolledCourses = courses.filter((i: any) => i.status === 'added_enrolled')
  const completedCourses = courses.filter((i: any) => i.status === 'added_completed')
  const wishlistCourses = courses.filter((i: any) => i.status === 'wishlisted') // Displayed as "todo" in UI

  // Catch-all for any unmapped course statuses (should not happen with proper status management)
  // Exclude removed and suggested - these should not appear on profile
  const otherCourses = courses.filter((i: any) =>
    i.status !== 'added_enrolled' &&
    i.status !== 'added_completed' &&
    i.status !== 'wishlisted' &&
    i.status !== 'removed' &&
    i.status !== 'suggested'
  )

  console.log('Grouped counts - paying:', payingTools.length, 'free:', freeTools.length, 'wishlist:', wishlistTools.length, 'other tools:', otherTools.length)
  console.log('Grouped counts - enrolled:', enrolledCourses.length, 'completed:', completedCourses.length, 'wishlisted:', wishlistCourses.length, 'other courses:', otherCourses.length)

  // Filter paths based on ownership
  const displayPaths = isOwner ? paths : paths.filter((p: any) => p.is_public === true)

  // Calculate metrics for dashboard
  // 1. Count completed automated tasks across all paths (Time Saved calculation)
  // Each completed task in delegate_to_machine represents automated work (estimate 10 hours per task)
  let totalCompletedTasks = 0
  paths.forEach((path: any) => {
    if (path.efficiency_audit) {
      try {
        const audit = typeof path.efficiency_audit === 'string' 
          ? JSON.parse(path.efficiency_audit) 
          : path.efficiency_audit
        if (audit?.delegate_to_machine && Array.isArray(audit.delegate_to_machine)) {
          const completed = audit.delegate_to_machine.filter((task: any) => task.is_completed === true)
          totalCompletedTasks += completed.length
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  })
  const timeSavedHours = totalCompletedTasks * 10 // 10 hours per automated task

  // 2. Skills Gained = completed courses
  const skillsGained = completedCourses.length

  // One Source of Truth: Read current_hvq_score directly from upgrade_paths table
  // Average Calculation: This global score is the average of all current_hvq_score values from paths
  // Do NOT calculate scores in frontend - read saved values from database
  const currentPathScores = displayPaths
    .filter((path: any) => path.current_hvq_score !== null && path.current_hvq_score !== undefined)
    .map((path: any) => path.current_hvq_score)

  const previousPathScores = displayPaths
    .filter((path: any) => path.previous_hvq_score !== null && path.previous_hvq_score !== undefined)
    .map((path: any) => path.previous_hvq_score)

  // Calculate average from saved scores in database (not calculated in frontend)
  // If it shows 100, it means the save in the Path page failed (no scores saved yet)
  const globalAverage = currentPathScores.length > 0
    ? Math.round(currentPathScores.reduce((sum: number, score: number) => sum + score, 0) / currentPathScores.length)
    : 100

  // Calculate Delta: Compare average of current_hvq_score vs average of previous_hvq_score
  let globalDeltaPercent = null
  if (previousPathScores.length > 0 && currentPathScores.length > 0) {
    const previousAverage = previousPathScores.reduce((sum: number, score: number) => sum + score, 0) / previousPathScores.length
    if (previousAverage > 0) {
      globalDeltaPercent = Math.round(((globalAverage! - previousAverage) / previousAverage) * 100 * 10) / 10
    }
  }

  // Determine display name
  const displayName = displayProfile?.is_organization && displayProfile?.organization_name
    ? displayProfile.organization_name
    : displayProfile?.full_name || username

  return (
    <div className="min-h-screen">
      <main id="stack-capture" className="mx-auto max-w-6xl px-6 pt-8 pb-16">
        {/* HEADER */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h1 className="hidden md:block text-2xl font-normal text-zinc-900 dark:text-zinc-50">
              <span className="hidden md:inline">{displayName}'s </span>Dashboard
            </h1>
            {isOwner && (
              <div className="hidden md:block">
                <ShareButton
                  targetType="stack"
                  targetId={targetUserId}
                  isOwner={isOwner}
                  userName={
                    (displayProfile?.is_organization && displayProfile?.organization_name)
                      ? displayProfile.organization_name
                      : displayProfile?.full_name || "User"
                  }
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                />
              </div>
            )}
          </div>
        </div>

      {/* Metrics Row - 4 columns with sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* HVQ Overall Score */}
        <Card className="p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm md:text-xs text-blue-600 dark:text-blue-400">HVQ Overall Score</div>
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <LayoutDashboard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xl md:text-2xl font-bold text-blue-900 dark:text-blue-100">{globalAverage}</div>
            <div className="w-20 h-8">
              <svg width="100%" height="32" className="text-blue-600 dark:text-blue-400">
                {Array.from({ length: 7 }).map((_, i) => {
                  const barHeight = Math.random() * 18 + 6 + ((globalAverage - 100) / 15)
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

        {/* Active Paths */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm md:text-xs text-zinc-500 dark:text-zinc-400">Active Paths</div>
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{displayPaths.length}</div>
            <div className="w-20 h-8">
              <svg width="100%" height="32" className="text-purple-500">
                {Array.from({ length: 7 }).map((_, i) => {
                  const barHeight = Math.random() * 15 + 6 + (displayPaths.length * 1.5)
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
            <div className="text-sm md:text-xs text-zinc-500 dark:text-zinc-400">Time Saved</div>
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

        {/* Skills Gained */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm md:text-xs text-zinc-500 dark:text-zinc-400">Skills Gained</div>
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{skillsGained}</div>
            <div className="w-20 h-8">
              <svg width="100%" height="32" className="text-orange-500">
                {Array.from({ length: 7 }).map((_, i) => {
                  const barHeight = Math.random() * 14 + 6 + (skillsGained * 2)
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

      <div className="space-y-20">

        {/* --- SECTION 0: UPGRADE PATHS --- */}
        {displayPaths.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-2xl font-normal text-zinc-900">
                All Paths
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayPaths.map((path: any) => {
                // Get path_title or fallback to main_goal
                const displayTitle = path.path_title || path.main_goal || "Untitled Path"
                const createdDate = new Date(path.created_at)
                const formattedDate = createdDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })

                // Get score from database (current_hvq_score) - no calculation needed
                // Profile Sync: Display current_hvq_score and use previous_hvq_score for 'Daily Change %'
                const score = path.current_hvq_score ?? null
                const hasScore = score !== null
                const displayScore = score ?? 100 // Default for calculations

                // Calculate daily trend change using previous_hvq_score
                const previousScore = path.previous_hvq_score ?? null
                let dailyChangePercent = null
                if (hasScore && previousScore !== null && previousScore > 0) {
                  const change = ((displayScore - previousScore) / previousScore) * 100
                  dailyChangePercent = Math.round(change * 10) / 10
                } else if (hasScore && path.updated_at) {
                  const updatedAt = new Date(path.updated_at)
                  const createdAt = new Date(path.created_at)
                  const daysSinceCreation = Math.max(1, Math.floor((updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))
                  if (daysSinceCreation > 0 && displayScore > 100) {
                    const estimatedDailyChange = (displayScore - 100) / daysSinceCreation
                    dailyChangePercent = Math.round(estimatedDailyChange * 10) / 10
                  }
                }

                // Determine score badge color and label
                let scoreBadgeClass = ""
                let scoreLabel = ""
                let scoreLabelClass = "text-zinc-500 dark:text-zinc-400"

                if (hasScore) {
                  if (displayScore < 120) {
                    scoreBadgeClass = "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
                    scoreLabel = "Manual/Low Leverage"
                    scoreLabelClass = "text-red-600 dark:text-red-400"
                  } else if (displayScore >= 120 && displayScore <= 150) {
                    scoreBadgeClass = "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800"
                    scoreLabel = "Optimizing"
                    scoreLabelClass = "text-yellow-600 dark:text-yellow-400"
                  } else {
                    scoreBadgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                    scoreLabel = "High Leverage"
                    scoreLabelClass = "text-emerald-600 dark:text-emerald-400"
                  }
                }

                // Check if high priority (low score AND high importance_weight)
                const importanceWeight = path.importance_weight ?? 0
                const isHighPriority = hasScore && displayScore < 120 && importanceWeight > 7

                // Add warning border for low leverage paths
                const isLowLeverage = hasScore && displayScore < 120

                // Build slug-based URL
                const pathSlug = path.slug || path.id // Fallback to id if slug is missing
                const pathUrl = `/u/${displayUsername}/${pathSlug}`

                // Format last updated time
                const updatedDate = path.updated_at ? new Date(path.updated_at) : null
                const formattedUpdated = updatedDate ? updatedDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                }) : null

                return (
                  <PathCard
                    key={path.id}
                    path={path}
                    pathUrl={pathUrl}
                    displayTitle={displayTitle}
                    displayScore={displayScore}
                    score={score}
                    hasScore={hasScore}
                    dailyChangePercent={dailyChangePercent}
                    isOwner={isOwner}
                    isPublic={path.is_public || false}
                    displayProfile={displayProfile}
                    formattedUpdated={formattedUpdated}
                    mainGoal={path.main_goal}
                    role={path.role}
                  />
                )
              })}
              
              {/* Add New Path Card */}
              {isOwner && (
                <Link href={`/u/${displayUsername}/create`}>
                  <Card className="h-full transition-shadow cursor-pointer border-2 border-dashed border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600 flex items-center justify-center min-h-[200px]">
                    <CardContent className="p-6 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                          <Plus className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                            Add New Path
                          </h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Create a new upgrade path
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
            </div>
          </section>
        )}

        {/* --- SECTION 1: AI TOOLS --- */}
        {tools.length > 0 && (
          <section>
            {(() => {
              const allTools = [...payingTools, ...freeTools, ...wishlistTools, ...otherTools]
              const totalCount = allTools.length
              
              return (
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <Bot className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-normal text-zinc-900">AI Toolstack</h2>
                    <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-1 rounded-full font-normal">
                      {totalCount}
                    </span>
                  </div>
                  <Link 
                    href={`/u/${displayUsername}/tools`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                  >
                    View All
                  </Link>
                </div>
              )
            })()}

            {(() => {
              const allTools = [...payingTools, ...freeTools, ...wishlistTools, ...otherTools]
              const displayedTools = allTools.slice(0, 6)
              
              return (
                <TierSection title="" items={displayedTools} isOwner={isOwner} username={displayUsername} paths={paths} />
              )
            })()}
          </section>
        )}

        {/* --- SECTION 2: KNOWLEDGE BASE --- */}
        {courses.length > 0 && (
          <section>
            {(() => {
              const allCourses = [...enrolledCourses, ...completedCourses, ...wishlistCourses, ...otherCourses]
              const totalCount = allCourses.length
              
              return (
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <GraduationCap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-normal text-zinc-900">Human Skills</h2>
                    <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-1 rounded-full font-normal">
                      {totalCount}
                    </span>
                  </div>
                  <Link 
                    href={`/u/${displayUsername}/skills`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                  >
                    View All
                  </Link>
                </div>
              )
            })()}

            {(() => {
              const allCourses = [...enrolledCourses, ...completedCourses, ...wishlistCourses, ...otherCourses]
              const displayedCourses = allCourses.slice(0, 6)
              
              return (
                <CourseGroup
                  title=""
                  items={displayedCourses}
                  isOwner={isOwner}
                  username={displayUsername}
                  icon={null}
                  colorClass=""
                  paths={paths}
                />
              )
            })()}
          </section>
        )}

      </div>

      </main>
    </div>
  )
}

