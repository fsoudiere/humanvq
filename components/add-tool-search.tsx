"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Sparkles, X } from "lucide-react"
import ResourceIcon from "@/components/resource-icon"
import { addResourceToPath } from "@/actions/path-resources"
import { searchResources } from "@/actions/search-resources"
import AddMissingResourceModal from "@/components/add-missing-resource-modal"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface ResourceItem {
  id: string
  title: string
  description: string
  url?: string
  logodev?: string
  hvq_score_machine?: number
  hvq_score_human?: number
  // Optional fields that will be populated after router.refresh()
  hvq_primary_pillar?: string
  paid_count?: number
  completion_count?: number
  enrollment_count?: number
  capabilities?: string[]
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
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'tool' | 'course'>('all')

  const router = useRouter()

  // 1. Search Logic - Use semantic search via embeddings
  useEffect(() => {
    const abortController = new AbortController()
    
    const searchTools = async () => {
      if (query.length < 2) {
        setResults([])
        return
      }
      setLoading(true)

      try {
        // Determine filter_type based on active tab
        const filterType = activeTab === 'tool' ? 'tool' : activeTab === 'course' ? 'course' : 'all'
        
        // Call server action to search using embeddings
        const result = await searchResources(query, filterType)
        
        // Check if request was aborted
        if (abortController.signal.aborted) {
          return
        }
        
        if (result.success && result.data) {
          setResults(result.data)
        } else {
          console.error("Search failed:", result.error)
          setResults([])
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        console.error("Search error:", error)
        setResults([])
      } finally {
        // Only update loading state if not aborted
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    const timer = setTimeout(searchTools, 500)
    return () => {
      clearTimeout(timer)
      abortController.abort()
    }
  }, [query, activeTab])

  // 2. Add Logic - Use server action to add to path_resources
  const addToStack = async (tool: any) => {
    if (!pathId || !userId) {
      console.error("Missing pathId or userId:", { pathId, userId })
      return
    }

    setAdding(tool.id)

    // Determine resource type - infer from activeTab if type not in response
    // RPC returns name, description, url, logodev - type may or may not be included
    const resourceType = tool.type === 'human_course' 
      ? 'human_course' 
      : (activeTab === 'course' ? 'human_course' : 'ai_tool')

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

  const handleClose = () => {
    setIsOpen(false)
    setQuery("")
    setResults([])
  }

  const handleAddAndClose = async (tool: any) => {
    await addToStack(tool)
    handleClose()
  }

  const handleAdd = async (tool: any) => {
    await addToStack(tool)
    // Only clear query on mobile (when sheet is open)
    if (isOpen) {
      handleClose()
    } else {
      // On desktop, just clear the query
      setQuery("")
      setResults([])
    }
  }

  const handleSuggest = () => {
    setShowMissingModal(true)
    if (isOpen) {
      handleClose()
    }
  }

  const renderResults = (isMobile = false) => {
    if (loading) {
      return (
        <div className={`text-center ${isMobile ? 'py-12' : 'py-8'} text-zinc-500 dark:text-zinc-400`}>
          <p className="text-base md:text-sm">Searching...</p>
        </div>
      )
    }

    return (
      <div className={`space-y-2 ${isMobile ? '' : 'p-2'}`}>
        {results.map((tool) => (
          <div
            key={tool.id}
            onClick={() => handleAdd(tool)}
            className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer flex justify-between items-center border rounded-lg transition-colors"
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
                <p className="font-semibold text-base md:text-sm text-gray-900 dark:text-zinc-100">{tool.name}</p>
              </div>
              <div className="flex gap-2 items-center pl-[34px]">
                {(tool.type === 'human_course' || activeTab === 'course') && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">Course</span>
                )}
                <p className="text-sm md:text-xs text-gray-500 dark:text-zinc-400">{tool.description}</p>
              </div>
            </div>
            <button
              disabled={adding === tool.id}
              onClick={(e) => {
                e.stopPropagation()
                handleAdd(tool)
              }}
              className="text-sm md:text-xs border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 px-3 py-1 rounded-full flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-2"
            >
              <Plus className="w-3 h-3" /> {adding === tool.id ? "Adding..." : "Add"}
            </button>
          </div>
        ))}

        {/* Always show "Suggest" option after 2 characters, regardless of results */}
        <div
          onClick={handleSuggest}
          className={`p-4 hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer flex items-center gap-3 border rounded-lg ${results.length > 0 ? 'border-zinc-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900' : 'bg-gray-50 dark:bg-zinc-900'}`}
        >
          <Sparkles className="w-5 h-5 text-gray-900 dark:text-zinc-100" />
          <div className="flex-1">
            <p className="font-semibold text-base md:text-sm text-gray-900 dark:text-zinc-100">
              {results.length > 0 ? `Add "${query}" anyway?` : `"${query}" not found?`}
            </p>
            <p className="text-sm md:text-xs text-gray-600 dark:text-zinc-400">
              Suggest this tool/course to add it to the library
            </p>
          </div>
          <button className="text-sm md:text-xs bg-black hover:bg-gray-800 dark:bg-black dark:hover:bg-gray-800 text-white px-3 py-1.5 rounded-full flex items-center gap-1">
            <Plus className="w-3 h-3" /> Suggest
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile: + Icon Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="md:hidden h-9 w-9 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <Plus className="h-4 w-4" />
      </Button>

      {/* Desktop: Inline Search Input */}
      <div className="hidden md:block relative min-w-[400px] max-w-[600px] flex-1">
        {/* Tabs */}
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('tool')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'tool'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            Tools
          </button>
          <button
            onClick={() => setActiveTab('course')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'course'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            Courses
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
          <input
            type="text"
            placeholder="Type to search (e.g. 'Cursor' or 'Web Dev Course')..."
            className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500 text-base md:text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg z-50 max-h-96 overflow-y-auto min-w-full">
              {renderResults(false)}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Full Screen Search Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          className="h-screen max-h-screen w-full rounded-none p-0 gap-0 [&>button]:hidden"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg md:text-xl">Add Tool or Course</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4" style={{ height: 'calc(100vh - 120px)' }}>
            {/* Tabs */}
            <div className="flex gap-1 mb-4">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'all'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('tool')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'tool'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              >
                Tools
              </button>
              <button
                onClick={() => setActiveTab('course')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'course'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              >
                Courses
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Type to search (e.g. 'Cursor' or 'Web Dev Course')..."
                className="w-full pl-10 pr-4 py-3 border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500 text-base md:text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>

            {query.length >= 2 && !loading && (
              <div className="space-y-2">
                {results.length > 0 && results.map((tool) => (
                  <div
                    key={tool.id}
                    onClick={() => handleAddAndClose(tool)}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer flex justify-between items-center border rounded-lg transition-colors"
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
                        <p className="font-semibold text-base md:text-sm text-gray-900 dark:text-zinc-100">{tool.name}</p>
                      </div>
                      <div className="flex gap-2 items-center pl-[34px]">
                        {(tool.type === 'human_course' || activeTab === 'course') && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">Course</span>
                        )}
                        <p className="text-sm md:text-xs text-gray-500 dark:text-zinc-400">{tool.description}</p>
                      </div>
                    </div>
                    <button
                      disabled={adding === tool.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAddAndClose(tool)
                      }}
                      className="text-sm md:text-xs border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 px-3 py-1 rounded-full flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-2"
                    >
                      <Plus className="w-3 h-3" /> {adding === tool.id ? "Adding..." : "Add"}
                    </button>
                  </div>
                ))}

                {/* Always show "Suggest" option after 2 characters, regardless of results */}
                <div
                  onClick={() => {
                    setShowMissingModal(true)
                    handleClose()
                  }}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer flex items-center gap-3 border rounded-lg ${results.length > 0 ? 'border-zinc-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900' : 'bg-gray-50 dark:bg-zinc-900'}`}
                >
                  <Sparkles className="w-5 h-5 text-gray-900 dark:text-zinc-100" />
                  <div className="flex-1">
                    <p className="font-semibold text-base md:text-sm text-gray-900 dark:text-zinc-100">
                      {results.length > 0 ? `Add "${query}" anyway?` : `"${query}" not found?`}
                    </p>
                    <p className="text-sm md:text-xs text-gray-600 dark:text-zinc-400">
                      Suggest this tool/course to add it to the library
                    </p>
                  </div>
                  <button className="text-sm md:text-xs bg-black hover:bg-gray-800 dark:bg-black dark:hover:bg-gray-800 text-white px-3 py-1.5 rounded-full flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Suggest
                  </button>
                </div>
              </div>
            )}

            {query.length < 2 && (
              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-base md:text-sm">Start typing to search for tools or courses</p>
              </div>
            )}

            {loading && (
              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <p className="text-base md:text-sm">Searching...</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Missing Resource Modal */}
      <AddMissingResourceModal
        isOpen={showMissingModal}
        onClose={() => {
          setShowMissingModal(false)
          setQuery("")
        }}
        initialName={query}
        userId={userId}
      />
    </>
  )
}