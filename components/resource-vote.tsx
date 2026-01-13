"use client"

import { createClient } from "@/utils/supabase/client"
import { useState } from "react"

export default function ResourceVote({ 
  url,
  initialId, 
  userId 
}: { 
  url?: string
  initialId?: string
  userId: string 
}) {
  const [voted, setVoted] = useState<number | null>(null)
  const supabase = createClient()

  const handleVote = async (type: 1 | -1) => {
    if (voted !== null) return
    setVoted(type)

    let targetId = initialId

    // 1. If no ID, attempt the "Smart Lookup"
    if (!targetId && url) {
      console.log(`🔍 Looking up ID for: ${url}`) // Debug Log

      // First, try a standard match
      let { data } = await supabase
        .from("resources")
        .select("id")
        .ilike("url", url) // Case-insensitive
        .maybeSingle()

      // Second: If that fails, try a "Domain Match" (The robust fix)
      if (!data) {
        // Strip https://, www., and trailing slashes to get just "surferseo.com"
        const cleanDomain = url
          .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
          .split("/")[0]

        console.log(`⚠️ Exact match failed. Trying domain match: "%${cleanDomain}%"`)

        const { data: fuzzyData } = await supabase
          .from("resources")
          .select("id")
          .ilike("url", `%${cleanDomain}%`) // Matches anything containing the domain
          .limit(1) // Just take the first one found
          .maybeSingle()
        
        data = fuzzyData
      }

      if (data) targetId = data.id
    }

    // 2. If we STILL have no ID, it's a "New" tool not in our DB
    if (!targetId) {
      console.warn("❌ Tool not found in DB. Cannot vote.")
      // Optional: You could show a toast here saying "This is an external suggestion"
      setVoted(null) 
      return
    }

    // 3. Submit the Vote
    console.log(`✅ Found ID: ${targetId}. Voting...`)
    const { error } = await supabase.from("resource_feedback").insert({
      user_id: userId,
      resource_id: targetId,
      vote_type: type
    })

    if (error) {
      console.error("Vote failed:", error)
      setVoted(null)
    }
  }

  // Only render if we have something to work with
  if (!url && !initialId) return null

  return (
    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
      <span className="text-xs text-gray-400 self-center">Was this helpful?</span>
      <button 
        onClick={() => handleVote(1)}
        disabled={voted !== null}
        className={`text-xs px-2 py-1 rounded transition-colors ${voted === 1 ? 'bg-green-100 text-green-700 font-bold' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        👍 Yes
      </button>
      <button 
        onClick={() => handleVote(-1)}
        disabled={voted !== null}
        className={`text-xs px-2 py-1 rounded transition-colors ${voted === -1 ? 'bg-red-100 text-red-700 font-bold' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        👎 No
      </button>
    </div>
  )
}