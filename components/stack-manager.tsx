"use client"

import { createClient } from "@/utils/supabase/client"
import { useState, useEffect } from "react"
import { updateResourceStatus } from "@/actions/path-resources"
import { X } from "lucide-react"
import { useRouter } from "next/navigation"

interface StackManagerProps {
  resourceId: string | null
  initialStatus?: string
  isCourse?: boolean
  pathId?: string | null // Optional: if provided, updates path_resources for this specific path
  pathResourceStatus?: string // Current status in path_resources (suggested, added_free, added_paid, removed)
  onStatusChange?: (newStatus?: string) => void // Callback for parent to refresh data, optionally receives new status
}

export default function StackManager({ 
  resourceId, 
  initialStatus, 
  isCourse = false,
  pathId,
  pathResourceStatus,
  onStatusChange
}: StackManagerProps) {
  const [status, setStatus] = useState<string | null>(initialStatus || null)
  const [loading, setLoading] = useState(!initialStatus)
  const [pathStatus, setPathStatus] = useState<string | null>(pathResourceStatus || null)
  const supabase = createClient()
  const router = useRouter()

  // Update pathStatus when prop changes
  useEffect(() => {
    if (pathResourceStatus !== undefined) {
      setPathStatus(pathResourceStatus)
    }
  }, [pathResourceStatus])

  // 1. Handle "Ghost" Tools (Not in DB) - also check for 'null' string
  if (!resourceId || resourceId === 'null') {
    return (
      <div className="mt-4">
        <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-1 rounded border border-gray-200 cursor-not-allowed select-none">
          ⚠️ Not in Library
        </span>
      </div>
    )
  }

  // 2. Fetch Status from path_resources (if not provided and pathId is available)
  // If no pathId, we can't determine status since path_resources requires a path
  useEffect(() => {
    if (initialStatus || !pathId) {
      setLoading(false)
      return
    }

    async function checkPathResource() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !resourceId) return
      
      // Fetch from path_resources (single source of truth)
      const { data } = await supabase
        .from("path_resources")
        .select("status")
        .eq("path_id", pathId)
        .eq("resource_id", resourceId)
        .eq("user_id", user.id)
        .maybeSingle()
      
      if (data) {
        setPathStatus(data.status)
        // Map path_resources status to display status
        const statusMap: Record<string, string> = {
          'added_paid': 'paying',
          'added_free': 'free_user',
          'added_enrolled': 'enrolled',
          'added_completed': 'completed',
          'wishlisted': isCourse ? 'todo' : 'wishlist',
          'suggested': 'suggested'
        }
        setStatus(statusMap[data.status] || data.status)
      }
      setLoading(false)
    }
    checkPathResource()
  }, [resourceId, initialStatus, pathId, isCourse])

  // 3. Update Database - Context-Aware Logic
  const updateStack = async (newStatus: string) => {
    // Safety check: prevent null resourceId from being sent to Supabase
    if (!resourceId || resourceId === 'null') {
      console.error("Cannot update stack: resourceId is null or 'null'")
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // path_resources is the single source of truth - always requires a pathId
    if (!pathId) {
      console.error("Cannot update resource: pathId is required (path_resources is the single source of truth)")
      alert("Cannot update resource status without a path context")
      return
    }

    // Map dropdown status to path_resources status
    // Use specific statuses: added_paid/added_free for tools, added_enrolled/added_completed for courses
    let pathResourceStatus: 'suggested' | 'added_free' | 'added_paid' | 'added_enrolled' | 'added_completed' | 'wishlisted' | 'removed' = 'suggested'
    
    if (isCourse) {
      // Courses: added_enrolled, added_completed, wishlisted, removed
      if (newStatus === 'enrolled') pathResourceStatus = 'added_enrolled'
      else if (newStatus === 'completed') pathResourceStatus = 'added_completed'
      else if (newStatus === 'todo') pathResourceStatus = 'wishlisted'
      else if (newStatus === 'remove') pathResourceStatus = 'removed'
    } else {
      // Tools: added_free, added_paid, wishlisted, removed
      if (newStatus === 'paying') pathResourceStatus = 'added_paid'
      else if (newStatus === 'free_user') pathResourceStatus = 'added_free'
      else if (newStatus === 'wishlist') pathResourceStatus = 'wishlisted'
      else if (newStatus === 'remove') pathResourceStatus = 'removed'
    }

    // Call updateResourceStatus - updates path_resources (single source of truth)
    const result = await updateResourceStatus(pathId, resourceId, pathResourceStatus)
    if (result.success) {
      setPathStatus(pathResourceStatus)
      if (newStatus === 'remove') {
        setStatus(null)
      } else {
        setStatus(newStatus)
      }
      // Trigger parent refresh if callback provided (updates HVQ score, etc.)
      // Pass the new pathResourceStatus so parent can update impact_weight reactively
      if (onStatusChange) onStatusChange(pathResourceStatus)
      router.refresh()
    } else {
      console.error("Failed to update resource status:", result.error)
      alert(result.error || "Failed to update status")
    }
  }

  // Remove from path action (X button)
  // This only appears when pathId is provided (Path Page context)
  // Sets status to 'removed' in path_resources (single source of truth)
  const handleRemoveFromPath = async () => {
    if (!pathId || !resourceId) return
    
    const result = await updateResourceStatus(pathId, resourceId, 'removed')
    if (result.success) {
      setPathStatus('removed')
      // Trigger parent refresh if callback provided (updates HVQ score, etc.)
      // Pass 'removed' status so parent can update impact_weight reactively
      if (onStatusChange) onStatusChange('removed')
      router.refresh()
    } else {
      alert(result.error || "Failed to remove from path")
    }
  }

  if (loading) return <div className="mt-4 text-[10px] text-gray-300 animate-pulse">Loading...</div>

  // 4. Define Visual Styles
  const getStyle = () => {
    // If path-specific, show path status, otherwise show global status
    const displayStatus = pathStatus || status
    
    if (!displayStatus) return 'bg-white text-gray-500 border-gray-200'
    
    // Path-specific statuses (for tools)
    if (displayStatus === 'added_paid') return 'bg-purple-100 text-purple-700 border-purple-200'
    if (displayStatus === 'added_free') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (displayStatus === 'wishlisted') return 'bg-purple-50 text-purple-600 border-purple-100'
    
    // Path-specific statuses (for courses)
    if (displayStatus === 'added_completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (displayStatus === 'added_enrolled') return 'bg-blue-50 text-blue-600 border-blue-100'
    
    // Global statuses (fallback)
    if (displayStatus === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (displayStatus === 'enrolled') return 'bg-blue-50 text-blue-600 border-blue-100'
    if (displayStatus === 'todo') return 'bg-gray-100 text-gray-600 border-gray-200'
    if (displayStatus === 'paying') return 'bg-green-100 text-green-700 border-green-200'
    if (displayStatus === 'free_user') return 'bg-blue-50 text-blue-600 border-blue-100'
    if (displayStatus === 'wishlist') return 'bg-purple-50 text-purple-600 border-purple-100'
    if (displayStatus === 'churned') return 'bg-red-50 text-red-500 border-red-100'
    
    return 'bg-white text-gray-500'
  }

  // Determine current value for select
  // Map path_resources status to display status for the select dropdown
  const getSelectValue = () => {
    if (!pathId) return status || ""
    
    // Map path_resources status to display status for select
    if (pathStatus === 'added_paid') return 'paying'
    if (pathStatus === 'added_free') return 'free_user'
    if (pathStatus === 'added_enrolled') return 'enrolled'
    if (pathStatus === 'added_completed') return 'completed'
    if (pathStatus === 'wishlisted') return isCourse ? 'todo' : 'wishlist'
    if (pathStatus === 'suggested') return ""
    
    return status || ""
  }

  const currentValue = getSelectValue()

  return (
    <div className="mt-2 space-y-2">
      {/* X Button for removing from path (only if pathId is provided and not already removed) */}
      {pathId && pathStatus && pathStatus !== 'removed' && pathStatus !== 'suggested' && (
        <button
          onClick={handleRemoveFromPath}
          className="w-full text-xs px-2 py-1.5 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
          title="Remove from path"
        >
          <X className="h-3 w-3" />
          Remove from Path
        </button>
      )}
      
      <select 
        value={currentValue} 
        onChange={(e) => updateStack(e.target.value)}
        className={`w-full text-xs border rounded px-2 py-1.5 cursor-pointer font-medium appearance-none transition-colors ${getStyle()}`}
      >
        <option value="" disabled>
          {pathStatus === 'suggested' ? '+ Add to Path' : `+ Add to ${isCourse ? 'Courses' : 'Stack'}`}
        </option>
        
        {isCourse ? (
          // ✅ COURSES ONLY
          <>
            <option value="enrolled">📖 Enrolled (In Progress)</option>
            <option value="completed">🎓 Completed</option>
            <option value="todo">📋 On My List</option>
          </>
        ) : (
          // 🛠️ TOOLS ONLY
          <>
            <option value="paying">💸 I Pay for this</option>
            <option value="free_user">🆓 I use Free Tier</option>
            <option value="wishlist">🔖 Wishlist</option>
            <option value="churned">💀 Stopped Using</option>
          </>
        )}
        
        {/* Only show "Remove" option on Path pages (when pathId is provided) */}
        {/* On Profile pages (no pathId), we don't want to delete from global stack */}
        {currentValue && pathId && <option value="remove">❌ Remove from Path</option>}
      </select>
    </div>
  )
}