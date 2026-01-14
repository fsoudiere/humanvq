"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { Search, Plus } from "lucide-react"
import ResourceIcon from "@/components/resource-icon"

export default function AddToolSearch({ userId }: { userId: string }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  
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
        .select("id, name, description, type, url") 
        .ilike("name", `%${query}%`)
        .limit(5)

      setResults(data || [])
      setLoading(false)
    }

    const timer = setTimeout(searchTools, 300)
    return () => clearTimeout(timer)
  }, [query])

  // 2. Add Logic (Smart Status)
  const addToStack = async (tool: any) => {
    // Check if it is a course
    const isCourse = tool.type === 'human_course';
    
    // Set appropriate default status
    const defaultStatus = isCourse ? 'todo' : 'free_user';

    await supabase.from("user_stacks").upsert({
      user_id: userId,
      resource_id: tool.id,
      status: defaultStatus // 👈 Uses the correct status now
    })
    
    setQuery("")
    setResults([])
    router.refresh()
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Type to add (e.g. 'Cursor' or 'Web Dev Course')..."
          className="w-full pl-10 pr-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-black text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border rounded-xl shadow-xl overflow-hidden">
          {results.map((tool) => (
            <div 
              key={tool.id}
              onClick={() => addToStack(tool)} // Pass the whole tool object, not just ID
              className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center border-b last:border-0"
            >
              <div>
              <div className="shrink-0 bg-white p-1 border border-zinc-100 rounded">
                    <ResourceIcon 
                        url={tool.url} 
                        name={tool.name} 
                        className="w-6 h-6 object-contain" 
                    />
                    </div>
                <p className="font-semibold text-sm text-gray-900">{tool.name}</p>
                <div className="flex gap-2 items-center">
                   {tool.type === 'human_course' && (
                     <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">Course</span>
                   )}
                   <p className="text-xs text-gray-500 truncate max-w-[200px]">{tool.description}</p>
                </div>
              </div>
              <button className="text-xs bg-black text-white px-3 py-1 rounded-full flex items-center gap-1 hover:bg-gray-800">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}