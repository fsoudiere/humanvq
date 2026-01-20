"use client"

import Link from "next/link"
import { Globe, Lock, ArrowUp, ArrowDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ShareButton } from "@/components/share-button"
import { DeletePathButton } from "@/components/delete-path-button"
import { ClonePathButton } from "@/components/clone-path-button"

interface PathCardProps {
  path: any
  pathUrl: string
  displayTitle: string
  displayScore: number
  score: number | null
  hasScore: boolean
  dailyChangePercent: number | null
  isOwner: boolean
  isPublic: boolean
  displayProfile?: {
    full_name: string | null
  }
  formattedUpdated: string | null
  mainGoal: string | null
  role: string | null
  username?: string
}

export function PathCard({
  path,
  pathUrl,
  displayTitle,
  displayScore,
  score,
  hasScore,
  dailyChangePercent,
  isOwner,
  isPublic,
  displayProfile,
  formattedUpdated,
  mainGoal,
  role,
  username,
}: PathCardProps) {
  return (
    <Card className="h-full transition-shadow cursor-pointer relative border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 group">
      <CardContent className="p-4">
        <div className="flex flex-col h-full">
          {/* Top Right: Action Buttons (Owner only) */}
          {isOwner && (
            <div 
              className="absolute top-3 right-3 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <ClonePathButton
                  pathId={path.id}
                  username={username}
                  variant="ghost"
                  size="icon"
                />
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <ShareButton
                  targetType="path"
                  targetId={path.id}
                  isOwner={isOwner}
                  initialVisibility={isPublic}
                  pathTitle={displayTitle}
                  userName={displayProfile?.full_name || undefined}
                  variant="ghost"
                  size="icon"
                />
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <DeletePathButton pathId={path.id} />
              </div>
            </div>
          )}

          {/* Share Icon Indicator (Always visible for owners) - Shows when buttons are hidden */}
          {isOwner && (
            <div className="absolute top-3 right-3 z-0 opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none">
              {isPublic ? (
                <Globe className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
              ) : (
                <Lock className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
              )}
            </div>
          )}

          <Link href={pathUrl} className="flex flex-col h-full">
            {/* HVQ Score - Large and Prominent */}
            <div className="mb-4">
              <div className="flex items-baseline gap-3">
                {score !== null ? (
                  <span className="text-3xl md:text-4xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {displayScore}
                  </span>
                ) : (
                  <span className="text-3xl md:text-4xl font-semibold text-zinc-300 dark:text-zinc-700">
                    100
                  </span>
                )}
                {hasScore && dailyChangePercent !== null && (
                  <div className={`flex items-center gap-1 text-base md:text-sm font-medium ${dailyChangePercent > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : dailyChangePercent < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                    }`}>
                    {dailyChangePercent > 0 ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : dailyChangePercent < 0 ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : null}
                    <span>
                      {dailyChangePercent > 0 ? '+' : ''}{dailyChangePercent}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Path Title */}
            <h3 className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3 line-clamp-2 pr-8">
              {displayTitle}
            </h3>

            {/* Path Details - Goal and Role only */}
            <div className="flex-1 space-y-2 mb-2">
              {mainGoal && (
                <p className="text-sm md:text-sm text-zinc-600 dark:text-zinc-400">
                  {mainGoal}
                </p>
              )}
              {role && (
                <p className="text-sm md:text-xs text-zinc-500 dark:text-zinc-400">
                  {role}
                </p>
              )}
            </div>

            {/* Last Updated Time */}
            {formattedUpdated && (
              <p className="text-sm md:text-xs text-zinc-400 dark:text-zinc-500 mt-auto">
                Updated {formattedUpdated}
              </p>
            )}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
