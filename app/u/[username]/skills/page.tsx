"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { FilterBar } from "@/components/filter-bar"
import CourseGroup from "@/components/course-group"
import { Card, CardContent } from "@/components/ui/card"
import { GraduationCap, Clock, CheckCircle2, ListTodo } from "lucide-react"

export default function SkillsPage() {
  const params = useParams()
  const username = params.username as string
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [pathResources, setPathResources] = useState<any[]>([])
  const [paths, setPaths] = useState<any[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      // Get target user ID
      let targetUserId: string | null = null
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(username)

      if (isUUID) {
        targetUserId = username
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("username", username)
          .maybeSingle()
        targetUserId = profile?.user_id || null
      }

      if (!targetUserId) {
        setLoading(false)
        return
      }

      // Check ownership
      setIsOwner(currentUser?.id === targetUserId)

      // Fetch paths
      const { data: pathsData } = await supabase
        .from("upgrade_paths")
        .select("id, path_title, main_goal")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })

      if (pathsData) {
        setPaths(pathsData)
      }

      // Fetch path_resources
      const { data: allPathResourcesRaw } = await supabase
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
        .neq("status", "removed")
        .neq("status", "suggested")

      // Filter out null resources and only human courses
      const validResources = (allPathResourcesRaw || [])
        .filter((pr: any) => pr.resource !== null && pr.resource_id !== null)
        .filter((pr: any) => pr.resource?.type === 'human_course')

      setPathResources(validResources)
      setLoading(false)
    }

    if (username) {
      fetchData()
    }
  }, [username, supabase])

  // Apply filters
  const filteredResources = useMemo(() => {
    let filtered = pathResources

    if (selectedPathId) {
      filtered = filtered.filter((pr: any) => pr.path_id === selectedPathId)
    }

    if (selectedStatus) {
      filtered = filtered.filter((pr: any) => pr.status === selectedStatus)
    }

    // Deduplicate by resource_id
    const resourceMap: Record<string, any> = {}
    filtered.forEach((pr: any) => {
      const resourceId = pr.resource_id
      if (!resourceMap[resourceId]) {
        resourceMap[resourceId] = {
          resource: pr.resource,
          status: pr.status,
          paths: []
        }
      }
      if (pr.upgrade_paths) {
        const pathExists = resourceMap[resourceId].paths.some((p: any) => p.id === pr.upgrade_paths.id)
        if (!pathExists) {
          resourceMap[resourceId].paths.push({
            id: pr.upgrade_paths.id,
            title: pr.upgrade_paths.path_title || pr.upgrade_paths.main_goal || "Untitled Path",
            slug: pr.upgrade_paths.slug || pr.upgrade_paths.id
          })
        }
      }
    })

    return Object.values(resourceMap).map((item) => ({
      status: item.status,
      resource: item.resource,
      paths: item.paths
    }))
  }, [pathResources, selectedPathId, selectedStatus])

  // Get unique statuses
  const uniqueStatuses = useMemo(() => {
    const statusSet = new Set(pathResources.map((pr: any) => pr.status))
    return Array.from(statusSet).sort()
  }, [pathResources])

  // Group by status
  const enrolledCourses = filteredResources.filter((i: any) => i.status === 'added_enrolled')
  const completedCourses = filteredResources.filter((i: any) => i.status === 'added_completed')
  const wishlistCourses = filteredResources.filter((i: any) => i.status === 'wishlisted')

  if (loading) {
    return (
      <div className="min-h-screen">
        <main className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center py-12">Loading...</div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <GraduationCap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h1 className="text-2xl font-normal text-zinc-900 dark:text-zinc-50">
              Human Skills
            </h1>
          </div>
        </div>

        {/* FilterBar */}
        <FilterBar
          paths={paths}
          statuses={uniqueStatuses}
          selectedPathId={selectedPathId}
          selectedStatus={selectedStatus}
          onPathChange={setSelectedPathId}
          onStatusChange={setSelectedStatus}
        />

        {/* Results */}
        {filteredResources.length === 0 ? (
          <Card className="p-12 text-center">
            <CardContent>
              <p className="text-zinc-500">No courses found matching your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <CourseGroup
            title=""
            items={filteredResources}
            isOwner={isOwner}
            username={username}
            icon={null}
            colorClass=""
            paths={paths}
          />
        )}
      </main>
    </div>
  )
}