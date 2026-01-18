"use client"

import { createClient } from "@/utils/supabase/client"
import { useState, useEffect, useRef } from "react"
import { updateResourceStatus } from "@/actions/path-resources"
import { ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"

interface StackManagerProps {
  resourceId: string | null
  initialStatus?: string
  isCourse?: boolean
  pathId?: string | null
  pathResourceStatus?: string
  onStatusChange?: (newStatus?: string) => void
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
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  // Update pathStatus when prop changes
  useEffect(() => {
    if (pathResourceStatus !== undefined) {
      setPathStatus(pathResourceStatus)
    }
  }, [pathResourceStatus])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // 1. Handle "Ghost" Tools (Not in DB)
  if (!resourceId || resourceId === 'null') {
    return (
      <div className="mt-4">
        <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-1 rounded-full border border-gray-200 cursor-not-allowed select-none">
          Not in Library
        </span>
      </div>
    )
  }

  // 2. Fetch Status from path_resources
  useEffect(() => {
    if (initialStatus || !pathId) {
      setLoading(false)
      return
    }

    async function checkPathResource() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !resourceId) return
      
      const { data } = await supabase
        .from("path_resources")
        .select("status")
        .eq("path_id", pathId)
        .eq("resource_id", resourceId)
        .eq("user_id", user.id)
        .maybeSingle()
      
      if (data) {
        setPathStatus(data.status)
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

  // 3. Update Database
  const updateStack = async (newStatus: string) => {
    if (!resourceId || resourceId === 'null') {
      console.error("Cannot update stack: resourceId is null or 'null'")
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (!pathId) {
      console.error("Cannot update resource: pathId is required")
      alert("Cannot update resource status without a path context")
      return
    }

    let pathResourceStatus: 'suggested' | 'added_free' | 'added_paid' | 'added_enrolled' | 'added_completed' | 'wishlisted' | 'removed' = 'suggested'
    
    if (isCourse) {
      if (newStatus === 'enrolled') pathResourceStatus = 'added_enrolled'
      else if (newStatus === 'completed') pathResourceStatus = 'added_completed'
      else if (newStatus === 'wishlist') pathResourceStatus = 'wishlisted'
      else if (newStatus === 'remove') pathResourceStatus = 'removed'
    } else {
      if (newStatus === 'paying') pathResourceStatus = 'added_paid'
      else if (newStatus === 'free_user') pathResourceStatus = 'added_free'
      else if (newStatus === 'wishlist') pathResourceStatus = 'wishlisted'
      else if (newStatus === 'remove') pathResourceStatus = 'removed'
    }

    const result = await updateResourceStatus(pathId, resourceId, pathResourceStatus)
    if (result.success) {
      setPathStatus(pathResourceStatus)
      if (newStatus === 'remove') {
        setStatus(null)
      } else {
        setStatus(newStatus)
      }
      if (onStatusChange) onStatusChange(pathResourceStatus)
      setShowMenu(false)
      router.refresh()
    } else {
      console.error("Failed to update resource status:", result.error)
      alert(result.error || "Failed to update status")
    }
  }

  // Remove from path action
  const handleRemoveFromPath = async () => {
    if (!pathId || !resourceId) return
    
    const result = await updateResourceStatus(pathId, resourceId, 'removed')
    if (result.success) {
      setPathStatus('removed')
      setStatus(null)
      if (onStatusChange) onStatusChange('removed')
      setShowMenu(false)
      router.refresh()
    } else {
      alert(result.error || "Failed to remove from path")
    }
  }

  if (loading) return <div className="mt-4 text-[10px] text-gray-300 animate-pulse">Loading...</div>

  // Status options and styles
  const getStatusInfo = (statusValue: string) => {
    if (isCourse) {
      if (statusValue === 'enrolled') return { label: 'Enrolled', color: 'bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' }
      if (statusValue === 'completed') return { label: 'Completed', color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' }
      if (statusValue === 'wishlist' || statusValue === 'todo') return { label: 'Wishlist', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800' }
    } else {
      if (statusValue === 'paying') return { label: 'Paying For', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' }
      if (statusValue === 'free_user') return { label: 'Free Trial', color: 'bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' }
      if (statusValue === 'wishlist') return { label: 'Wishlist', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800' }
    }
    return null
  }

  // Get current status for display
  const getCurrentStatus = () => {
    if (!pathId) return status || ""
    
    if (pathStatus === 'added_paid') return 'paying'
    if (pathStatus === 'added_free') return 'free_user'
    if (pathStatus === 'added_enrolled') return 'enrolled'
    if (pathStatus === 'added_completed') return 'completed'
    if (pathStatus === 'wishlisted') return 'wishlist'
    if (pathStatus === 'suggested') return ""
    
    return status || ""
  }

  const currentStatus = getCurrentStatus()
  const statusInfo = currentStatus ? getStatusInfo(currentStatus) : null
  const isAdded = pathStatus && pathStatus !== 'suggested' && pathStatus !== 'removed'

  // Status options based on type
  const statusOptions = isCourse
    ? [
        { value: 'wishlist', label: 'Wishlist', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800' },
        { value: 'enrolled', label: 'Enrolled', color: 'bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' },
        { value: 'completed', label: 'Completed', color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' },
      ]
    : [
        { value: 'wishlist', label: 'Wishlist', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800' },
        { value: 'paying', label: 'Paying For', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
        { value: 'free_user', label: 'Free Trial', color: 'bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' },
      ]

  return (
    <div className="relative" ref={menuRef}>
      {isAdded && statusInfo ? (
        // Show pill with current status (clickable to change)
        <div className="relative inline-flex items-center">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors ${statusInfo.color} hover:opacity-90`}
          >
            <span>{statusInfo.label}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg py-1">
              {statusOptions.map((option) => {
                // Extract only text and border colors, remove background colors
                const colorClasses = option.color
                  .split(' ')
                  .filter(cls => !cls.startsWith('bg-'))
                  .join(' ')
                return (
                  <button
                    key={option.value}
                    onClick={() => updateStack(option.value)}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-black/[2%] dark:hover:bg-white/[2%] transition-colors ${colorClasses} border-l-2`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        // Show "+ Add to Path" button with dropdown
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <span>+ Add to Path</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg py-1">
              {statusOptions.map((option) => {
                // Extract only text and border colors, remove background colors
                const colorClasses = option.color
                  .split(' ')
                  .filter(cls => !cls.startsWith('bg-'))
                  .join(' ')
                return (
                  <button
                    key={option.value}
                    onClick={() => updateStack(option.value)}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-black/[2%] dark:hover:bg-white/[2%] transition-colors ${colorClasses} border-l-2`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
