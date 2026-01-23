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
 * Search resources using semantic search via embeddings with text-based fallback
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

    // Map filterType to database values
    let dbFilterType: 'ai_tool' | 'human_course' | 'all' = 'all'
    if (filterType === 'tool') {
      dbFilterType = 'ai_tool'
    } else if (filterType === 'course') {
      dbFilterType = 'human_course'
    }

    // 1. Try semantic search first
    let semanticResults: any[] = []
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      })
      const queryEmbedding = embeddingResponse.data[0].embedding

      const { data, error } = await supabase.rpc("search_resource_embeddings", {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 10,
        filter_type: dbFilterType,
      })

      if (!error && data) {
        semanticResults = data
      }
    } catch (semanticError) {
      // Continue with text search fallback
    }

    // 2. Also do text-based search for partial name matches (handles "retell" -> "Retell AI")
    let textResults: any[] = []
    try {
      let textQuery = supabase
        .from("resources")
        .select("id, name, description, url, logodev, type")
        .ilike("name", `%${query}%`)
        .limit(10)

      // Apply type filter if specified
      if (dbFilterType !== 'all') {
        textQuery = textQuery.eq("type", dbFilterType)
      }

      const { data: textData, error: textError } = await textQuery

      if (!textError && textData) {
        textResults = textData
      }
    } catch (textError) {
      // Continue without text results
    }

    // 3. Combine results, prioritizing semantic matches, then deduplicate by id
    const resultMap = new Map<string, any>()
    
    // Add semantic results first (higher priority)
    semanticResults.forEach((item) => {
      if (item.id) {
        resultMap.set(item.id, item)
      }
    })
    
    // Add text results (won't overwrite semantic matches)
    textResults.forEach((item) => {
      if (item.id && !resultMap.has(item.id)) {
        resultMap.set(item.id, item)
      }
    })

    const combinedResults = Array.from(resultMap.values())

    return { success: true, data: combinedResults }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to search resources" }
  }
}