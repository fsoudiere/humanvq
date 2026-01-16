import { createClient } from "@/utils/supabase/server"
import { Metadata } from "next"
import Link from "next/link"
import { Target } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_organization, organization_name")
    .eq("username", username)
    .maybeSingle()

  const displayName = profile?.is_organization && profile?.organization_name
    ? profile.organization_name
    : profile?.full_name || username
  const stackLabel = profile?.is_organization ? "Company Stack" : "AI Stack"
  const title = `${displayName}'s Public ${stackLabel}`
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

export default async function PublicUsernamePage({ params }: PageProps) {
  const { username } = await params
  const supabase = await createClient()
  
  // Fetch profile by username
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, full_name, username, is_organization, organization_name")
    .eq("username", username)
    .maybeSingle()

  // If profile doesn't exist, show 404
  if (!profile) {
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

  // Fetch public upgrade paths for this user
  const { data: paths, error: pathsError } = await supabase
    .from("upgrade_paths")
    .select("*")
    .eq("user_id", profile.user_id)
    .eq("is_public", true)
    .order('created_at', { ascending: false })

  const publicPaths = paths || []

  // Determine display name
  const displayName = profile.is_organization && profile.organization_name
    ? profile.organization_name
    : profile.full_name || username

  const stackType = profile.is_organization ? "Company Stack" : "Stack"

  return (
    <div id="stack-capture" className="max-w-4xl mx-auto py-12 px-4">
      
      {/* HEADER */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold mb-2">
          {displayName}'s {stackType}
        </h1>
        <p className="text-zinc-500 mt-2">
          {profile.is_organization ? "Public organization portfolio" : "Public portfolio"}
        </p>
      </div>

      <div className="space-y-20">
        
        {/* --- SECTION: PUBLIC UPGRADE PATHS --- */}
        {publicPaths.length > 0 ? (
          <section>
            <div className="flex items-center gap-2 mb-8 border-b pb-4">
              <Target className="w-6 h-6 text-zinc-400" />
              <h2 className="text-2xl font-bold text-zinc-900">
                {profile.is_organization ? "Company Upgrade Paths" : "Upgrade Paths"}
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicPaths.map((path: any) => {
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
                
                // Check if low leverage for border styling
                const isLowLeverage = hasScore && displayScore < 120
                
                return (
                  <div key={path.id}>
                    <Card className={`h-full transition-shadow relative ${
                      isLowLeverage 
                        ? 'border-2 border-red-300 dark:border-red-700' 
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}>
                      <CardContent className="p-6">
                        <div className="flex flex-col h-full">
                          {/* Header with Score Badge */}
                          <div className="mb-3 relative">
                            {/* Score Badge - Top Right */}
                            {score !== null && (
                              <div className={`absolute top-0 right-0 px-2 py-1 rounded-full text-xs font-semibold border ${scoreBadgeClass}`}>
                                {score}
                              </div>
                            )}
                            
                            {/* Path Title */}
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 pr-16 mb-1">
                              {displayTitle}
                            </h3>
                            
                            {/* Score Label */}
                            {hasScore && (
                              <p className={`text-xs ${scoreLabelClass}`}>
                                {scoreLabel}
                              </p>
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
                          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                            <span>{formattedDate}</span>
                            {dailyChangePercent !== null && (
                              <span className={dailyChangePercent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                                {dailyChangePercent >= 0 ? "+" : ""}{dailyChangePercent}% today
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <div className="text-center py-12">
            <p className="text-zinc-500">No public paths available yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
