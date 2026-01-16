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
  // Calculate Global Average: Sum of all current_hvq_score / Number of Paths
  // This is the Global Human Moat Score
  const currentPathScores = paths
    .filter((path: any) => path.current_hvq_score !== null && path.current_hvq_score !== undefined)
    .map((path: any) => path.current_hvq_score)
  
  const previousPathScores = paths
    .filter((path: any) => path.previous_hvq_score !== null && path.previous_hvq_score !== undefined)
    .map((path: any) => path.previous_hvq_score)
  
  // Calculate average of all current_hvq_score values
  const calculatedAverage = currentPathScores.length > 0
    ? currentPathScores.reduce((sum: number, score: number) => sum + score, 0) / currentPathScores.length
    : profile?.current_hvq_score ?? 100
  
  const overallScore = Math.round(calculatedAverage)
  
  // Calculate Delta (Change): Compare average of current_hvq_score vs average of previous_hvq_score
  let deltaPercent = null
  if (previousPathScores.length > 0 && currentPathScores.length > 0) {
    const previousAverage = previousPathScores.reduce((sum: number, score: number) => sum + score, 0) / previousPathScores.length
    if (previousAverage > 0) {
      deltaPercent = Math.round(((overallScore - previousAverage) / previousAverage) * 100 * 10) / 10
    }
  } else if (profile?.previous_hvq_score !== null && profile?.previous_hvq_score !== undefined && profile.previous_hvq_score > 0) {
    // Fallback to profile previous_hvq_score if path-level previous scores aren't available
    deltaPercent = Math.round(((overallScore - profile.previous_hvq_score) / profile.previous_hvq_score) * 100 * 10) / 10
  }
  
  // Use deltaPercent for display
  const trendPercent = deltaPercent
  
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
              {/* Delta Badge - Global percentage change */}
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
                    {trendPercent > 0 ? '+' : ''}{trendPercent}% change
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
                {currentPathScores.length}
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
                {paths.filter((p: any) => p.current_hvq_score !== null && p.current_hvq_score < 120).length}
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
