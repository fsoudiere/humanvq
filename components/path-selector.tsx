"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"
import Link from "next/link"

interface Path {
  id: string
  path_title: string | null
  slug: string | null
  main_goal: string | null
}

export default function PathSelector({ username }: { username: string }) {
  const [paths, setPaths] = useState<Path[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const fetchPaths = async () => {
      const supabase = createClient()
      
      // First get the profile to get user_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("username", username)
        .maybeSingle()

      if (!profile) return

      // Fetch all paths for this user
      const { data: pathsData } = await supabase
        .from("upgrade_paths")
        .select("id, path_title, slug, main_goal")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })

      if (pathsData) {
        setPaths(pathsData)
      }
    }

    if (username) {
      fetchPaths()
    }
  }, [username])

  // Extract current path slug from pathname
  const pathSlugMatch = pathname?.match(/\/u\/[^\/]+\/([^\/]+)/)
  const currentPathSlug = pathSlugMatch ? pathSlugMatch[1] : null
  
  const currentPath = currentPathSlug 
    ? paths.find(p => p.slug === currentPathSlug || p.id === currentPathSlug)
    : null
  const currentPathTitle = currentPath?.path_title || currentPath?.main_goal || "Select Path"

  // Check if we're on a path page (has slug in URL and not /create)
  const isOnPathPage = currentPathSlug && pathname?.includes(`/u/${username}/`) && !pathname?.endsWith("/create")

  if (!isOnPathPage || paths.length === 0) {
    return null
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50 px-2 h-auto py-1"
      >
        <span className="truncate max-w-[200px]">{currentPathTitle}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </Button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[250px] max-w-[300px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg py-1">
            {paths.map((path) => {
              const pathTitle = path.path_title || path.main_goal || "Untitled Path"
              const pathUrl = `/u/${username}/${path.slug || path.id}`
              const isActive = (path.slug === currentPathSlug || path.id === currentPathSlug)
              
              return (
                <Link
                  key={path.id}
                  href={pathUrl}
                  onClick={() => setIsOpen(false)}
                  className={`block px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    isActive ? "bg-zinc-100 dark:bg-zinc-800 font-medium" : ""
                  }`}
                >
                  <div className="truncate">{pathTitle}</div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}