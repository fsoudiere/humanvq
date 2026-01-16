import { getUserStack } from "@/actions/get-stack"
import { createClient } from "@/utils/supabase/server"
import StackManager from "@/components/stack-manager"
import ShareStackButton from "@/components/share-stack-button"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import AddToolSearch from "@/components/add-tool-search"
import { BookOpen, Wrench, GraduationCap, CheckCircle2, Clock, ListTodo, Target } from "lucide-react"
import { Metadata } from "next"
import ResourceIcon from "@/components/resource-icon"
import { HVQScoreboard } from "@/components/hvq-scoreboard"
import { Card, CardContent } from "@/components/ui/card"
import { DeletePathButton } from "@/components/delete-path-button"
import { TogglePathVisibility } from "@/components/toggle-path-visibility"

interface PageProps {
  params: Promise<{ userId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { userId } = await params
  
  // Fetch user profile simply to get their name
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_organization, organization_name")
    .eq("user_id", userId)
    .maybeSingle()

  // Determine display text based on organization status
  // If profile is null, it means the user hasn't completed their profile yet
  const displayName = profile?.is_organization && profile?.organization_name
    ? profile.organization_name
    : profile?.full_name || "Founder"
  const stackLabel = profile?.is_organization ? "Company Stack" : "AI Stack"
  const title = `${displayName}'s ${stackLabel}`
  const description = profile?.is_organization 
    ? "Check out our curated list of AI tools and learning resources."
    : "Check out my curated list of AI tools and learning resources."

  return {
    title: title,
    description: description,
    openGraph: {
      title: title,
      description: description,
      type: "website",
      // images: ['/default-stack-image.jpg'] // Optional: Add a default image in your public folder
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
    }
  }
}

export default async function PublicStackPage({ params }: PageProps) {
  // STEP 1: Auth First - Always get current user from auth first
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
  const isOwner = currentUser?.id === userId
  
  // STEP 2: Fetch stack data (uses userId from params, which is fine for viewing)
  const data = await getUserStack(userId)
  const stack = data?.stack || []
  const profile = data?.profile // May be null
  const paths = data?.paths || []
  
  // STEP 3: Fail-Safe - If profile is null but we have auth user, use user metadata
  // Only use this for display purposes when viewing own stack
  let displayProfile: any = profile
  
  // Debug: Log profile data to verify organization_name is being fetched
  console.log("🔍 Dashboard - Profile Data:", {
    userId: userId,
    profile: profile,
    profileKeys: profile ? Object.keys(profile) : null,
    hasOrganization: profile?.is_organization,
    organizationName: profile?.organization_name,
    fullName: profile?.full_name,
    rawProfile: JSON.stringify(profile)
  })
  
  // If profile exists, use it directly (this ensures organization_name is available)
  if (profile) {
    displayProfile = profile
  } else if (isOwner && currentUser) {
    // Create a fallback profile object from user metadata only if profile doesn't exist
    // Using 'any' type because this is a partial fallback for display only
    displayProfile = {
      full_name: currentUser.user_metadata?.full_name || 
                 currentUser.user_metadata?.name || 
                 currentUser.email?.split('@')[0] || 
                 "User",
      is_organization: false,
      organization_name: null,
      user_id: currentUser.id,
      main_goal: null,
      current_hvq_score: null,
      previous_hvq_score: null,
      username: null
    }
    console.log("🔍 Dashboard - Profile is null, using auth fallback:", {
      userId: currentUser.id,
      displayProfile: displayProfile,
      userMetadata: currentUser.user_metadata
    })
  }

  // 2. Handle Empty State
  if (stack.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h1 className="text-2xl font-bold mb-4">Empty Stack 📭</h1>
        <p className="text-zinc-500 mb-6">This {data?.profile?.is_organization ? "organization" : "user"} hasn't curated their AI stack yet.</p>
        <Link href="/">
          <Button>{data?.profile?.is_organization ? "Generate Company Stack" : "Generate My Stack"}</Button>
        </Link>
      </div>
    )
  }

  // --- 3. SEPARATE & GROUP DATA ---
  
  // Split into Arrays
// 1. Strict Filter for Courses (Matches 'human_course' exactly)
const courses = stack.filter((i: any) => i.resource.type === 'human_course')
// 2. Everything else is a Tool (Matches 'ai_tool', null, or anything else)
const tools = stack.filter((i: any) => i.resource.type !== 'human_course')

  // Group Tools
  const payingTools = tools.filter((i: any) => i.status === 'paying')
  const freeTools = tools.filter((i: any) => i.status === 'free_user')
  const wishlistTools = tools.filter((i: any) => i.status === 'wishlist')
  const churnedTools = tools.filter((i: any) => i.status === 'churned')

  // Group Courses
  const enrolledCourses = courses.filter((i: any) => i.status === 'enrolled')
  const completedCourses = courses.filter((i: any) => i.status === 'completed')
  const todoCourses = courses.filter((i: any) => i.status === 'todo')

  return (
    <div id="stack-capture" className="max-w-4xl mx-auto py-12 px-4">
      
      {/* HEADER */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold mb-2">
          {(() => {
            // Use displayProfile (which has fallback) instead of profile
            const displayName = displayProfile?.is_organization && displayProfile?.organization_name
              ? displayProfile.organization_name
              : displayProfile?.full_name || "Founder"
            const stackType = displayProfile?.is_organization ? "Company Stack" : "Stack"
            return `${displayName}'s ${stackType}`
          })()}
        </h1>
        
        {isOwner && (
          <>
            <div className="hide-on-export mt-4 flex flex-col items-center gap-2">
              <span className="text-green-600 text-xs font-medium bg-green-50 px-3 py-1 rounded-full border border-green-100">
                ✅ You are viewing your {displayProfile?.is_organization ? "company's" : ""} public page
              </span>
            </div>

            <div className="flex justify-center gap-3 mt-6 mb-10">
              <ShareStackButton 
                userId={userId} 
                userName={
                  (displayProfile?.is_organization && displayProfile?.organization_name)
                    ? displayProfile.organization_name
                    : displayProfile?.full_name || "User"
                } 
              />
              <Link href={`/stack/${userId}/create`}>
                <Button variant="outline" className="rounded-full">+ New Path</Button>
              </Link>
            </div>
            
            <div className="mb-10">
               <AddToolSearch userId={userId} />
            </div>
          </>
        )}
      </div>

      {/* HVQ Scoreboard */}
      {isOwner && profile && <HVQScoreboard stack={stack} paths={paths} profile={profile || undefined} />}

      <div className="space-y-20">
        
        {/* --- SECTION 0: YOUR/COMPANY UPGRADE PATHS --- */}
        {paths.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-8 border-b pb-4">
              <Target className="w-6 h-6 text-zinc-400" />
              <h2 className="text-2xl font-bold text-zinc-900">
                {displayProfile?.is_organization ? "Company Upgrade Paths" : "Your Upgrade Paths"}
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paths.map((path: any) => {
                // Get path_title or fallback to main_goal
                const displayTitle = path.path_title || path.main_goal || "Untitled Path"
                const createdDate = new Date(path.created_at)
                const formattedDate = createdDate.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric' 
                })
                
                // Get score and determine styling
                const score = path.hvq_score ?? null
                const hasScore = score !== null
                const displayScore = score ?? 100 // Default for calculations
                
                // Calculate daily trend change
                const previousScore = path.previous_hvq_score ?? null
                let dailyChangePercent = null
                if (hasScore && previousScore !== null && previousScore > 0) {
                  // Calculate percentage change from previous score
                  const change = ((displayScore - previousScore) / previousScore) * 100
                  dailyChangePercent = Math.round(change * 10) / 10 // Round to 1 decimal
                } else if (hasScore && path.updated_at) {
                  // Estimate daily change based on time since creation
                  // This is a placeholder - ideally we'd have historical data
                  const updatedAt = new Date(path.updated_at)
                  const createdAt = new Date(path.created_at)
                  const daysSinceCreation = Math.max(1, Math.floor((updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))
                  if (daysSinceCreation > 0 && displayScore > 100) {
                    // Estimate improvement rate (placeholder calculation)
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
                
                return (
                  <Link key={path.id} href={`/stack/${userId}/${path.id}`}>
                    <Card className={`h-full hover:shadow-lg transition-shadow cursor-pointer relative ${
                      isLowLeverage 
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
                                <div className={`flex items-center gap-1 text-xs font-semibold ${
                                  dailyChangePercent > 0 
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
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
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
              <TierSection title="💸 Essential (Paying)" items={payingTools} isOwner={isOwner} />
              <TierSection title="⚡ Daily Drivers (Free)" items={freeTools} isOwner={isOwner} />
              <TierSection title="🔖 Wishlist" items={wishlistTools} isOwner={isOwner} />
              {isOwner && <TierSection title="💀 Churned" items={churnedTools} isOwner={isOwner} />}
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
                  icon={<Clock className="w-4 h-4 text-blue-600" />}
                  colorClass="border-blue-200 bg-blue-50/50"
                />
              )}

              {/* Completed */}
              {completedCourses.length > 0 && (
                <CourseGroup 
                  title="🎓 Completed" 
                  items={completedCourses} 
                  isOwner={isOwner} 
                  icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  colorClass="border-emerald-200 bg-emerald-50/50"
                />
              )}

              {/* To Do */}
              {todoCourses.length > 0 && (
                <CourseGroup 
                  title="📋 To Do List" 
                  items={todoCourses} 
                  isOwner={isOwner} 
                  icon={<ListTodo className="w-4 h-4 text-gray-500" />}
                  colorClass="border-gray-200 bg-gray-50/50"
                />
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

// --- SUB-COMPONENT 1: TOOLS (Standard Tier List) ---
function TierSection({ title, items, isOwner }: any) {
  if (items.length === 0) return null
  return (
    <div className="p-6 bg-white border border-zinc-200 rounded-xl shadow-sm">
      <h3 className="text-lg font-bold mb-4 text-zinc-800 flex items-center gap-2">
        {title} 
        <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-normal">
          {items.length}
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item: any) => (
          
          <div key={item.resource.id} className="p-4 border border-zinc-100 rounded-lg hover:bg-zinc-50 transition relative group">
            <div className="shrink-0 mt-1">
              <ResourceIcon 
                url={item.resource.url}
                logo_url={item.resource.logo_url}
                name={item.resource.name}
                className="w-16 h-16 rounded-md object-contain bg-white border border-zinc-100 p-1"
              />
            </div>
            <div className="flex justify-between items-start mb-2">
              <span className="font-semibold text-sm pr-6">{item.resource.name}</span>
              {isOwner && (
                <div className="absolute top-4 right-4 scale-90 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <StackManager resourceId={item.resource.id} initialStatus={item.status} isCourse={false} />
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 line-clamp-2 mb-2">{item.resource.description}</p>
            {(
               <a href={item.resource.url} target="_blank" className="text-[10px] text-blue-600 hover:underline block">
                 View Tool →
               </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// --- SUB-COMPONENT 2: COURSES (New Grouping Style) ---
function CourseGroup({ title, items, isOwner, icon, colorClass }: any) {
  return (
    <div className={`p-6 rounded-xl border ${colorClass}`}>
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-zinc-800">
        {icon} {title}
        <span className="text-xs bg-white border border-zinc-200 px-2 py-0.5 rounded-full text-zinc-500 font-normal ml-auto">
          {items.length} Items
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item: any) => (
          <div key={item.resource.id} className="bg-white p-4 rounded-lg border border-zinc-200/60 shadow-sm flex flex-col h-full">
            <div className="shrink-0">
                 <ResourceIcon 
                   url={item.resource.url}
                   logo_url={item.resource.logo_url}
                   name={item.resource.name}
                   className="w-16 h-16 rounded object-contain"
                 />
              </div>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                
                <span className="font-bold text-sm text-zinc-900">{item.resource.name}</span>
              </div>
              
              {/* 👇 This is the magic prop: isCourse={true} */}
              {isOwner && (
                <div className="scale-90 origin-top-right">
                  <StackManager 
                    resourceId={item.resource.id} 
                    initialStatus={item.status} 
                    isCourse={true} 
                  />
                </div>
              )}
            </div>
            
            <p className="text-xs text-zinc-500 mb-3 line-clamp-2">
              {item.resource.description}
            </p>
            
            {!isOwner && (
              <div className="mt-auto pt-2 border-t border-zinc-50">
                <a href={item.resource.url} target="_blank" className="text-xs font-semibold text-blue-600 hover:underline">
                  Start Learning →
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}