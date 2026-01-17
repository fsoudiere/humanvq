/**
 * Source of Truth for HVQ (Human Value Quotient) scoring calculation.
 * 
 * Calculates the HVQ score based on:
 * - Base score: 100
 * - Completed immediate steps: +15 points each
 * - Completed delegate tasks: +10 points each
 * - Resource leverage: Sum of (hvq_score * impact_weight) for all resources
 * 
 * @param data - The upgrade path data containing efficiency_audit and immediate_steps
 * @param resources - Object containing ai_tools and human_courses arrays with resource data
 * @param resourceWeights - Mapping of resource ID to impact_weight from path_resources table
 * @returns The calculated HVQ score
 */
interface ResourceItem {
  id?: string
  hvq_score_machine?: number
  hvq_score_human?: number
}

export function calculateHVQScore(
  data: {
    efficiency_audit?: {
      delegate_to_machine?: Array<{ is_completed: boolean }>
    }
    immediate_steps?: Array<{ is_completed: boolean }>
  },
  resources: {
    ai_tools: ResourceItem[]
    human_courses: ResourceItem[]
  },
  resourceWeights: Record<string, number>
): number {
  const BASE_SCORE = 100
  
  // Calculate points from completed immediate steps
  const completedSteps = (data.immediate_steps || []).filter(
    (step) => step.is_completed
  ).length
  const stepPoints = completedSteps * 15
  
  // Calculate points from completed delegate tasks
  const completedDelegateTasks = (data.efficiency_audit?.delegate_to_machine || []).filter(
    (task) => task.is_completed
  ).length
  const delegatePoints = completedDelegateTasks * 10
  
  // Calculate resource leverage points using relational data from path_resources
  // Loop through resources and use impact_weight from the database
  let resourcePoints = 0
  
  // Process AI tools
  ;(resources.ai_tools || []).forEach((resource) => {
    if (resource.id) {
      const impactWeight = resourceWeights[resource.id] || 0
      const leverage = resource.hvq_score_machine || 0
      resourcePoints += leverage * impactWeight
    }
  })
  
  // Process human courses
  ;(resources.human_courses || []).forEach((resource) => {
    if (resource.id) {
      const impactWeight = resourceWeights[resource.id] || 0
      const leverage = resource.hvq_score_human || 0
      resourcePoints += leverage * impactWeight
    }
  })
  
  return BASE_SCORE + stepPoints + delegatePoints + Math.round(resourcePoints)
}