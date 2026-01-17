import { createClient } from "@/utils/supabase/server"
import ShareStackButton from "@/components/share-stack-button"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { BookOpen, Wrench, GraduationCap, CheckCircle2, Clock, ListTodo, Target, ArrowUp, ArrowDown, Settings } from "lucide-react"
import { Metadata } from "next"
import ResourceIcon from "@/components/resource-icon"
import { Card, CardContent } from "@/components/ui/card"
import { DeletePathButton } from "@/components/delete-path-button"
import { TogglePathVisibility } from "@/components/toggle-path-visibility"
import TierSection from "@/components/tier-section"
import CourseGroup from "@/components/course-group"

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

  // STEP 4: Fetch upgrade_paths for Global Human Moat Score and Path cards
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
        id, name, description, url, logo_url, capabilities, type
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
    console.error("Error fetching path_resources:", pathResourcesError)
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

  const stackType = displayProfile?.is_organization ? "Company Stack" : "Stack"

  return (
    <div id="stack-capture" className="max-w-4xl mx-auto py-12 px-4">

      {/* HEADER */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1"></div>
          <h1 className="text-4xl font-extrabold mb-2 flex-1">
            {displayName}'s {stackType}
          </h1>
          <div className="flex-1 flex justify-end">
            {isOwner && (
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
            )}
          </div>
        </div>

        {isOwner ? (
          <>
            <div className="hide-on-export mt-4 flex flex-col items-center gap-2">
              <span className="text-green-600 text-xs font-medium bg-green-50 px-3 py-1 rounded-full border border-green-100">
                ✅ You are viewing your {displayProfile?.is_organization ? "company's" : ""} public page
              </span>
            </div>

            <div className="flex justify-center gap-3 mt-6 mb-10">
              <ShareStackButton
                userId={targetUserId}
                userName={
                  (displayProfile?.is_organization && displayProfile?.organization_name)
                    ? displayProfile.organization_name
                    : displayProfile?.full_name || "User"
                }
              />
              <Link href={`/u/${displayUsername}/create`}>
                <Button variant="outline" className="rounded-full">+ New Path</Button>
              </Link>
            </div>
          </>
        ) : (
          <p className="text-zinc-500 mt-2">
            {profile.is_organization ? "Public organization portfolio" : "Public portfolio"}
          </p>
        )}
      </div>

      {/* Global HVQ Score Hero Badge - Primary score display for all users */}
      {/* One Source of Truth: Read directly from upgrade_paths.current_hvq_score, averaged */}
      <div className="mb-12 flex justify-center">
        <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-8 shadow-xl">
          <div className="text-center">
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">
              Global Human Moat Score
            </div>
            <div className="flex items-baseline justify-center gap-4 mb-3">
              <div className="text-7xl font-extrabold text-blue-900 dark:text-blue-100">
                {globalAverage}
              </div>
              {globalDeltaPercent !== null && globalDeltaPercent !== 0 && (
                <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${globalDeltaPercent > 0
                  ? 'bg-emerald-500 text-white dark:bg-emerald-600 shadow-lg shadow-emerald-500/50'
                  : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                  }`}>
                  {globalDeltaPercent > 0 ? (
                    <ArrowUp className="w-4 h-4" />
                  ) : (
                    <ArrowDown className="w-4 h-4" />
                  )}
                  <span>
                    {globalDeltaPercent > 0 ? '+' : ''}{globalDeltaPercent}%
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400">
              {currentPathScores.length > 0
                ? `Average of ${currentPathScores.length} ${currentPathScores.length === 1 ? 'path' : 'paths'} (from database)`
                : globalAverage === 100
                  ? 'Base score (100) - indicates no paths saved scores yet'
                  : 'Base human score (no paths yet)'
              }
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-20">

        {/* --- SECTION 0: UPGRADE PATHS --- */}
        {displayPaths.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-8 border-b pb-4">
              <Target className="w-6 h-6 text-zinc-400" />
              <h2 className="text-2xl font-bold text-zinc-900">
                {isOwner
                  ? (displayProfile?.is_organization ? "Company Upgrade Paths" : "Your Upgrade Paths")
                  : (profile.is_organization ? "Company Upgrade Paths" : "Upgrade Paths")
                }
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

                return (
                  <Link key={path.id} href={pathUrl}>
                    <Card className={`h-full hover:shadow-lg transition-shadow cursor-pointer relative ${isLowLeverage
                      ? 'border-2 border-red-300 hover:border-red-400 dark:border-red-700 dark:hover:border-red-600'
                      : 'border-zinc-200 hover:border-zinc-300'
                      }`}>
                      <CardContent className="p-6">
                        <div className="flex flex-col h-full">
                          {/* Action Buttons - Only show for owner */}
                          {isOwner && (
                            <div className="flex gap-2 mb-3">
                              <TogglePathVisibility pathId={path.id} initialIsPublic={path.is_public || false} />
                              <DeletePathButton pathId={path.id} />
                            </div>
                          )}

                          {/* Header with Score Badge */}
                          <div className="mb-3 relative">
                            {/* Score Badge - Top Right */}
                            {score !== null && (
                              <div className={`absolute top-0 right-0 px-2 py-1 rounded-full text-xs font-semibold border ${scoreBadgeClass}`}>
                                {score}
                              </div>
                            )}

                            {/* High Priority Tag */}
                            {isHighPriority && (
                              <div className="absolute top-0 left-0 px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">
                                High Priority
                              </div>
                            )}

                            <div className={`text-xs text-zinc-500 dark:text-zinc-400 mb-2 ${isHighPriority ? 'mt-8' : ''}`}>
                              {formattedDate}
                            </div>
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 pr-16">
                              {displayTitle}
                            </h3>
                            {/* Score Label */}
                            {hasScore && (
                              <div className={`text-[10px] mt-1 ${scoreLabelClass}`}>
                                {scoreLabel}
                              </div>
                            )}
                          </div>

                          {/* Path Details */}
                          <div className="flex-1 space-y-2 mb-4">
                            {path.main_goal && (
                              <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                                {path.main_goal}
                              </p>
                            )}

                            {path.role && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Role: {path.role}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Footer */}
                          <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                              View Path
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            {path.efficiency_audit ? (
                              <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                                ✓ Ready
                              </div>
                            ) : (
                              <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                                ⏳ Generating...
                              </div>
                            )}

                            {/* Daily Trend Change Indicator */}
                            {hasScore && dailyChangePercent !== null && (
                              <div className="mt-3 flex items-center gap-2">
                                <div className={`flex items-center gap-1 text-xs font-semibold ${dailyChangePercent > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : dailyChangePercent < 0
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-zinc-500 dark:text-zinc-400'
                                  }`}>
                                  {dailyChangePercent > 0 ? (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                  ) : dailyChangePercent < 0 ? (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6 6" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                                    </svg>
                                  )}
                                  <span>
                                    {dailyChangePercent > 0 ? '+' : ''}{dailyChangePercent}%
                                  </span>
                                </div>
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                  daily
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* --- SECTION 1: AI TOOLS --- */}
        {tools.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-8 border-b pb-4">
              <Wrench className="w-6 h-6 text-zinc-400" />
              <h2 className="text-2xl font-bold text-zinc-900">AI Tool Arsenal</h2>
            </div>

            <div className="space-y-8">
              <TierSection title="💸 Essential (Paying)" items={payingTools} isOwner={isOwner} username={displayUsername} paths={paths} />
              <TierSection title="⚡ Daily Drivers (Free)" items={freeTools} isOwner={isOwner} username={displayUsername} paths={paths} />
              <TierSection title="🔖 Wishlist" items={wishlistTools} isOwner={isOwner} username={displayUsername} paths={paths} />
            </div>
          </section>
        )}

        {/* --- SECTION 2: KNOWLEDGE BASE --- */}
        {courses.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-8 border-b pb-4">
              <GraduationCap className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-zinc-900">Knowledge Base</h2>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* In Progress */}
              {enrolledCourses.length > 0 && (
                <CourseGroup
                  title="📖 In Progress"
                  items={enrolledCourses}
                  isOwner={isOwner}
                  username={displayUsername}
                  icon={<Clock className="w-4 h-4 text-blue-600" />}
                  colorClass="border-blue-200 bg-blue-50/50"
                  paths={paths}
                />
              )}

              {/* Completed */}
              {completedCourses.length > 0 && (
                <CourseGroup
                  title="🎓 Completed"
                  items={completedCourses}
                  isOwner={isOwner}
                  username={displayUsername}
                  icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  colorClass="border-emerald-200 bg-emerald-50/50"
                  paths={paths}
                />
              )}

              {/* Wishlisted / To Do */}
              {wishlistCourses.length > 0 && (
                <CourseGroup
                  title="📋 To Do List"
                  items={wishlistCourses}
                  isOwner={isOwner}
                  username={displayUsername}
                  icon={<ListTodo className="w-4 h-4 text-gray-500" />}
                  colorClass="border-gray-200 bg-gray-50/50"
                  paths={paths}
                />
              )}

              {/* Other Courses */}
              {otherCourses.length > 0 && (
                <CourseGroup
                  title="📚 Other Courses"
                  items={otherCourses}
                  isOwner={isOwner}
                  username={displayUsername}
                  icon={<BookOpen className="w-4 h-4 text-gray-500" />}
                  colorClass="border-gray-200 bg-gray-50/50"
                  paths={paths}
                />
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

