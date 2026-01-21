"use server"

import { createClient } from "@/utils/supabase/server"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface SearchResourcesResult {
  success: boolean
  data?: any[]
  error?: string
}

/**
 * Search resources using semantic search via embeddings
 * @param query - The search query text
 * @param filterType - 'tool', 'course', or 'all'
 * @returns Search results or error
 */
export async function searchResources(
  query: string,
  filterType: 'tool' | 'course' | 'all' = 'all'
): Promise<SearchResourcesResult> {
  try {
    const supabase = await createClient()

    // Generate embedding from query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    })
    const queryEmbedding = embeddingResponse.data[0].embedding

    // Map filterType to database values
    let dbFilterType: 'ai_tool' | 'human_course' | 'all' = 'all'
    if (filterType === 'tool') {
      dbFilterType = 'ai_tool'
    } else if (filterType === 'course') {
      dbFilterType = 'human_course'
    }

    // Call the RPC function with correct parameter order:
    // 1. query_embedding (first parameter)
    // 2. match_threshold: 0.3
    // 3. match_count: 10
    // 4. filter_type: 'ai_tool', 'human_course', or 'all'
    const { data, error } = await supabase.rpc("search_resource_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 10,
      filter_type: dbFilterType,
    })

    if (error) {
      console.error("RPC search error:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error("Search resources error:", error)
    return { success: false, error: error.message || "Failed to search resources" }
  }
}