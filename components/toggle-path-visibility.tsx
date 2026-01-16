"use client"

import { useState } from "react"
import { Globe, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { togglePathVisibility } from "@/actions/toggle-path-visibility"
import { useRouter } from "next/navigation"

interface TogglePathVisibilityProps {
  pathId: string
  initialIsPublic: boolean
}

export function TogglePathVisibility({ pathId, initialIsPublic }: TogglePathVisibilityProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [isUpdating, setIsUpdating] = useState(false)
  const router = useRouter()

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const newValue = !isPublic
    setIsPublic(newValue)
    setIsUpdating(true)

    try {
      const result = await togglePathVisibility(pathId, newValue)
      if (!result.success) {
        // Revert on error
        setIsPublic(!newValue)
        alert(result.error || "Failed to update visibility")
      } else {
        // Refresh to show updated state
        router.refresh()
      }
    } catch (error) {
      console.error("Error toggling path visibility:", error)
      // Revert on error
      setIsPublic(!newValue)
      alert("An error occurred while updating visibility")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isUpdating}
      className={`gap-2 ${
        isPublic
          ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-950/20 border-blue-200 dark:border-blue-800"
          : "text-zinc-600 hover:text-zinc-700 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-zinc-950/20"
      }`}
      title={isPublic ? "Make private" : "Make public"}
    >
      {isPublic ? (
        <>
          <Globe className="h-4 w-4" />
          Public
        </>
      ) : (
        <>
          <Lock className="h-4 w-4" />
          Private
        </>
      )}
    </Button>
  )
}
