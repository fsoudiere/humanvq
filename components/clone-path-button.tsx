"use client"

import { useState } from "react"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clonePath } from "@/actions/clone-path"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

interface ClonePathButtonProps {
  pathId: string
  username?: string
  variant?: "ghost" | "default" | "outline"
  size?: "icon" | "sm" | "default"
}

export function ClonePathButton({ pathId, username, variant = "ghost", size = "icon" }: ClonePathButtonProps) {
  const [isCloning, setIsCloning] = useState(false)
  const router = useRouter()

  const handleClone = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isCloning) return

    setIsCloning(true)
    try {
      const result = await clonePath(pathId)
      
      if (result.success && result.pathId) {
        // Fetch the new path to get its slug or ID for redirect
        const supabase = createClient()
        const { data: newPath } = await supabase
          .from("upgrade_paths")
          .select("slug, id")
          .eq("id", result.pathId)
          .maybeSingle()

        // Get username if not provided
        let targetUsername = username
        if (!targetUsername) {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("username")
              .eq("user_id", user.id)
              .maybeSingle()
            targetUsername = profile?.username || user.id
          }
        }

        // Redirect to the new path (will show analyzing state if not ready)
        if (targetUsername) {
          const pathSlug = newPath?.slug || newPath?.id || result.pathId
          router.push(`/u/${targetUsername}/${pathSlug}`)
          router.refresh()
        } else {
          router.refresh()
        }
      } else {
        alert(result.error || "Failed to clone path")
        setIsCloning(false)
      }
    } catch (error) {
      console.error("Error cloning path:", error)
      alert("An error occurred while cloning the path")
      setIsCloning(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClone}
      disabled={isCloning}
      className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      title={isCloning ? "Cloning..." : "Clone path"}
    >
      <Copy className={`h-4 w-4 ${isCloning ? "animate-spin" : ""}`} />
    </Button>
  )
}
