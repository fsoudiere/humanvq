"use client"

import { createClient } from "@/utils/supabase/client"
import { useState, useEffect } from "react"

interface StackManagerProps {
  resourceId: string | null
  initialStatus?: string
  isCourse?: boolean // 👈 Simple boolean flag
}

export default function StackManager({ resourceId, initialStatus, isCourse = false }: StackManagerProps) {
  const [status, setStatus] = useState<string | null>(initialStatus || null)
  const [loading, setLoading] = useState(!initialStatus)
  const supabase = createClient()

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

  // 2. Fetch Status (if not provided)
  useEffect(() => {
    if (initialStatus) return

    async function checkStack() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from("user_stacks")
        .select("status")
        .eq("user_id", user.id)
        .eq("resource_id", resourceId)
        .maybeSingle()
      
      if (data) setStatus(data.status)
      setLoading(false)
    }
    checkStack()
  }, [resourceId, initialStatus])

  // 3. Update Database
  const updateStack = async (newStatus: string) => {
    // Safety check: prevent null resourceId from being sent to Supabase
    if (!resourceId || resourceId === 'null') {
      console.error("Cannot update stack: resourceId is null or 'null'")
      return
    }

    setStatus(newStatus)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (newStatus === "remove") {
      await supabase.from("user_stacks").delete().eq("user_id", user.id).eq("resource_id", resourceId)
      setStatus(null)
    } else {
      await supabase.from("user_stacks").upsert({
        user_id: user.id,
        resource_id: resourceId,
        status: newStatus
      })
    }
  }

  if (loading) return <div className="mt-4 text-[10px] text-gray-300 animate-pulse">Loading...</div>

  // 4. Define Visual Styles
  const getStyle = () => {
    if (!status) return 'bg-white text-gray-500 border-gray-200'
    
    // Course Colors
    if (status === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (status === 'enrolled') return 'bg-blue-50 text-blue-600 border-blue-100' // "In Progress"
    if (status === 'todo') return 'bg-gray-100 text-gray-600 border-gray-200' // "On My List"

    // Tool Colors
    if (status === 'paying') return 'bg-green-100 text-green-700 border-green-200'
    if (status === 'free_user') return 'bg-blue-50 text-blue-600 border-blue-100'
    if (status === 'wishlist') return 'bg-purple-50 text-purple-600 border-purple-100'
    if (status === 'churned') return 'bg-red-50 text-red-500 border-red-100'
    
    return 'bg-white text-gray-500'
  }

  return (
    <div className="mt-2">
      <select 
        value={status || ""} 
        onChange={(e) => updateStack(e.target.value)}
        className={`w-full text-xs border rounded px-2 py-1.5 cursor-pointer font-medium appearance-none transition-colors ${getStyle()}`}
      >
        <option value="" disabled>+ Add to {isCourse ? 'Courses' : 'Stack'}</option>
        
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
        
        {status && <option value="remove">❌ Remove</option>}
      </select>
    </div>
  )
}