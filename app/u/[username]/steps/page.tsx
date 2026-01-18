"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { FilterBar } from "@/components/filter-bar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Footprints, CheckCircle2 } from "lucide-react"
import Link from "next/link"

interface StepItem {
  text: string
  is_completed: boolean
  pathId: string
  pathTitle: string
  pathSlug: string
}

export default function StepsPage() {
  const params = useParams()
  const username = params.username as string
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [paths, setPaths] = useState<any[]>([])
  const [allSteps, setAllSteps] = useState<StepItem[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

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

      // Fetch paths
      const { data: pathsData } = await supabase
        .from("upgrade_paths")
        .select("id, path_title, main_goal, slug, immediate_steps")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })

      if (pathsData) {
        setPaths(pathsData)

        // Extract all immediate steps from all paths
        const steps: StepItem[] = []
        pathsData.forEach((path: any) => {
          if (path.immediate_steps) {
            try {
              const immediateSteps = typeof path.immediate_steps === 'string'
                ? JSON.parse(path.immediate_steps)
                : path.immediate_steps

              if (Array.isArray(immediateSteps)) {
                immediateSteps.forEach((step: any) => {
                  steps.push({
                    text: step.text || '',
                    is_completed: step.is_completed || false,
                    pathId: path.id,
                    pathTitle: path.path_title || path.main_goal || "Untitled Path",
                    pathSlug: path.slug || path.id
                  })
                })
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        })

        setAllSteps(steps)
      }

      setLoading(false)
    }

    if (username) {
      fetchData()
    }
  }, [username, supabase])

  // Apply path filter
  const filteredSteps = useMemo(() => {
    if (!selectedPathId) {
      return allSteps
    }
    return allSteps.filter(step => step.pathId === selectedPathId)
  }, [allSteps, selectedPathId])

  // Group steps by path
  const stepsByPath = useMemo(() => {
    const grouped: Record<string, { path: { id: string; title: string; slug: string }, steps: StepItem[] }> = {}

    filteredSteps.forEach(step => {
      if (!grouped[step.pathId]) {
        grouped[step.pathId] = {
          path: {
            id: step.pathId,
            title: step.pathTitle,
            slug: step.pathSlug
          },
          steps: []
        }
      }
      grouped[step.pathId].steps.push(step)
    })

    return Object.values(grouped)
  }, [filteredSteps])

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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Footprints className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h1 className="text-2xl font-normal text-zinc-900 dark:text-zinc-50">
              Immediate Steps
            </h1>
          </div>
        </div>

        {/* FilterBar - Only path filter for steps */}
        <FilterBar
          paths={paths}
          statuses={[]}
          selectedPathId={selectedPathId}
          selectedStatus={null}
          onPathChange={setSelectedPathId}
          onStatusChange={() => { }}
        />

        {/* Results */}
        {filteredSteps.length === 0 ? (
          <Card className="p-12 text-center">
            <CardContent>
              <p className="text-zinc-500">No steps found matching your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {stepsByPath.map(({ path, steps }) => (
              <Card key={path.id} className="border-zinc-200 bg-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-normal">
                      <Link
                        href={`/u/${username}/${path.slug}`}
                        className="text-purple-600 hover:underline dark:text-purple-400"
                      >
                        {path.title}
                      </Link>
                    </CardTitle>
                    <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-1 rounded-full">
                      {steps.filter(s => s.is_completed).length} / {steps.length}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {steps.map((step, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className={`mt-0.5 ${step.is_completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                          {step.is_completed ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-zinc-300" />
                          )}
                        </span>
                        <span className={`flex-1 ${step.is_completed ? 'text-zinc-500 dark:text-zinc-500 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                          {step.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}