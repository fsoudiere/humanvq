"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { Search, Plus, Sparkles } from "lucide-react"
import ResourceIcon from "@/components/resource-icon"
import { addResourceToPath } from "@/actions/path-resources"
import AddMissingResourceModal from "@/components/add-missing-resource-modal"

interface ResourceItem {
  id: string
  title: string
  description: string
  url?: string
  logodev?: string
  hvq_score_machine?: number
  hvq_score_human?: number
}

interface AddToolSearchProps {
  pathId: string
  userId: string
  onAdd?: (resource: ResourceItem, type: 'ai_tool' | 'human_course') => void
}

export default function AddToolSearch({ pathId, userId, onAdd }: AddToolSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [showMissingModal, setShowMissingModal] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  // 1. Search Logic
  useEffect(() => {
    const searchTools = async () => {
      if (query.length < 2) {
        setResults([])
        return
      }
      setLoading(true)

      // 👇 WE MUST SELECT 'type' TO KNOW IF IT IS A COURSE
      const { data } = await supabase
        .from("resources")
        .select("id, name, description, type, url, logodev")
        .ilike("name", `%${query}%`)
        .limit(5)

      setResults(data || [])
      setLoading(false)
    }

    const timer = setTimeout(searchTools, 300)
    return () => clearTimeout(timer)
  }, [query])

  // 2. Add Logic - Use server action to add to path_resources
  const addToStack = async (tool: any) => {
    if (!pathId || !userId) {
      console.error("Missing pathId or userId:", { pathId, userId })
      return
    }

    setAdding(tool.id)

    // Determine resource type
    const resourceType = tool.type === 'human_course' ? 'human_course' : 'ai_tool'

    // Optimistic UI update - add to beginning of list immediately
    if (onAdd) {
      const resourceItem: ResourceItem = {
        id: tool.id,
        title: tool.name,
        description: tool.description || "",
        url: tool.url,
        logodev: tool.logodev,
        hvq_score_machine: undefined, // Will be fetched on refresh
        hvq_score_human: undefined // Will be fetched on refresh
      }
      onAdd(resourceItem, resourceType)
    }

    // Clear search immediately for better UX
    setQuery("")
    setResults([])

    try {
      const result = await addResourceToPath(pathId, tool.id)

      if (!result.success) {
        console.error("Failed to add tool to path:", result.error)
        // Log additional context for debugging
        console.error("Add tool context:", { pathId, userId, resourceId: tool.id })
        alert(`Failed to add tool: ${result.error || "Unknown error"}`)
        // Optionally: remove from optimistic update on error
        // For now, we'll let router.refresh() handle it
      }

      // Refresh to get complete data (logo, scores, etc.)
      router.refresh()
    } catch (error) {
      console.error("Error adding tool to path:", error)
      // Optionally: remove from optimistic update on error
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Type to add (e.g. 'Cursor' or 'Web Dev Course')..."
          className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query.length >= 2 && !loading && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-xl overflow-hidden">
          {results.map((tool) => (
            <div
              key={tool.id}
              onClick={() => addToStack(tool)} // Pass the whole tool object, not just ID
              className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center border-b"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <div className="shrink-0 bg-white p-1 rounded">
                    <ResourceIcon
                      url={tool.url}
                      logodev={tool.logodev}
                      name={tool.name}
                      className="w-6 h-6 object-contain"
                    />
                  </div>
                  <p className="font-semibold text-sm text-gray-900 truncate">{tool.name}</p>
                </div>
                <div className="flex gap-2 items-center pl-[34px]">
                  {tool.type === 'human_course' && (
                    <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">Course</span>
                  )}
                  <p className="text-xs text-gray-500 truncate max-w-[200px]">{tool.description}</p>
                </div>
              </div>
              <button
                disabled={adding === tool.id}
                onClick={(e) => {
                  e.stopPropagation()
                  addToStack(tool)
                }}
                className="text-xs border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 px-3 py-1 rounded-full flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-2"
              >
                <Plus className="w-3 h-3" /> {adding === tool.id ? "Adding..." : "Add"}
              </button>
            </div>
          ))}

          {/* Always show "Suggest" option after 2 characters, regardless of results */}
          <div
            onClick={() => setShowMissingModal(true)}
            className={`p-3 hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer flex items-center gap-3 ${results.length > 0 ? 'border-t border-zinc-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900' : 'bg-gray-50 dark:bg-zinc-900'}`}
          >
            <Sparkles className="w-5 h-5 text-gray-900 dark:text-zinc-100" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-gray-900 dark:text-zinc-100">
                {results.length > 0 ? `Add "${query}" anyway?` : `"${query}" not found?`}
              </p>
              <p className="text-xs text-gray-600 dark:text-zinc-400">
                Suggest this tool/course to add it to the library
              </p>
            </div>
            <button className="text-xs bg-black hover:bg-gray-800 dark:bg-black dark:hover:bg-gray-800 text-white px-3 py-1.5 rounded-full flex items-center gap-1">
              <Plus className="w-3 h-3" /> Suggest
            </button>
          </div>
        </div>
      )}

      {/* Missing Resource Modal */}
      <AddMissingResourceModal
        isOpen={showMissingModal}
        onClose={() => {
          setShowMissingModal(false)
          setQuery("") // Clear search when modal closes
        }}
        initialName={query}
        userId={userId}
      />
    </div>
  )
}