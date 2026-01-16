"use client"

import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/utils/supabase/client"
import { ArrowUp, ArrowDown } from "lucide-react"

interface HVQScoreboardProps {
  stack: any[]
  paths: any[]
  profile?: {
    current_hvq_score?: number | null
    previous_hvq_score?: number | null
    user_id?: string
    full_name?: string | null
    username?: string | null
    is_organization?: boolean | null
    organization_name?: string | null
  }
}

export function HVQScoreboard({ stack, paths, profile }: HVQScoreboardProps) {
  // Calculate overall HVQ by averaging all path scores
  const pathScores = paths
    .filter((path: any) => path.hvq_score !== null && path.hvq_score !== undefined)
    .map((path: any) => path.hvq_score)
  
  // If no path scores available, fallback to profile current_hvq_score or 100
  const calculatedAverage = pathScores.length > 0
    ? pathScores.reduce((sum: number, score: number) => sum + score, 0) / pathScores.length
    : profile?.current_hvq_score ?? 100
  
  const overallScore = Math.round(calculatedAverage)
  
  // Sync calculated average to profile if different
  // Note: previous_hvq_score is managed by cron job (Midnight Snapshot), frontend only updates current_hvq_score
  useEffect(() => {
    const syncToProfile = async () => {
      // Don't sync if no paths exist - only sync when we have actual path scores
      if (!profile?.user_id || !pathScores.length || paths.length === 0) return
      
      // Only sync if calculated average differs from stored value
      const storedScore = profile.current_hvq_score ?? null
      if (Math.abs(overallScore - (storedScore ?? 0)) > 0.5) {
        try {
          const supabase = createClient()
          // Get current user
          const { data: { user } } = await supabase.auth.getUser()
          if (!user || user.id !== profile.user_id) return
          
          // Only update current_hvq_score - previous_hvq_score is managed by cron job
          await supabase
            .from("profiles")
            .update({
              current_hvq_score: overallScore,
              updated_at: new Date().toISOString()
            })
            .eq("user_id", profile.user_id)
        } catch (error) {
          console.error("Failed to sync HVQ score to profile:", error)
        }
      }
    }
    
    syncToProfile()
  }, [overallScore, profile?.user_id, profile?.current_hvq_score, pathScores.length, paths.length])
  
  // Calculate trend from profile data (use calculated score for current if profile doesn't have it)
  const currentScore = profile?.current_hvq_score ?? (pathScores.length > 0 ? overallScore : null)
  const previousScore = profile?.previous_hvq_score ?? null
  let trendPercent = null
  if (currentScore !== null && previousScore !== null && previousScore > 0) {
    trendPercent = Math.round(((currentScore - previousScore) / previousScore) * 100 * 10) / 10
  }
  
  // Calculate score color based on range
  const getScoreColor = (score: number) => {
    if (score >= 200) return "text-emerald-600 dark:text-emerald-400"
    if (score >= 150) return "text-blue-600 dark:text-blue-400"
    if (score >= 100) return "text-yellow-600 dark:text-yellow-400"
    return "text-red-600 dark:text-red-400"
  }
  
  const getScoreLabel = (score: number) => {
    if (score >= 200) return "Elite"
    if (score >= 150) return "Advanced"
    if (score >= 100) return "Intermediate"
    return "Beginner"
  }

  // Get display name from profile
  const getDisplayName = () => {
    if (profile?.is_organization && profile?.organization_name) {
      return profile.organization_name
    }
    return profile?.full_name || profile?.username || "Your"
  }

  return (
    <Card className="mb-8 border-2">
      <CardHeader>
        <CardTitle className="text-2xl font-light tracking-tight">
          {getDisplayName()}'s HVQ Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-3">
              <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
                {overallScore}
              </div>
              {/* Trend Badge */}
              {trendPercent !== null && trendPercent !== 0 && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-all ${
                  trendPercent > 0
                    ? 'bg-emerald-500 text-white dark:bg-emerald-600 dark:text-emerald-50 shadow-lg shadow-emerald-500/50 animate-pulse'
                    : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                }`}>
                  {trendPercent > 0 ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )}
                  <span>
                    {trendPercent > 0 ? '+' : ''}{trendPercent}% from yesterday
                  </span>
                </div>
              )}
            </div>
            <div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {getScoreLabel(overallScore)} Level
              </div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Human Value Quotient
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {paths.length}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Total Paths
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {pathScores.length}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Scored Paths
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {paths.filter((p: any) => p.efficiency_audit).length}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Active Paths
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {paths.filter((p: any) => p.hvq_score !== null && p.hvq_score < 120).length}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Low Leverage
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
