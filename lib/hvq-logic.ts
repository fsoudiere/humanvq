/**
 * Source of Truth for HVQ (Human Value Quotient) scoring calculation.
 * 
 * --- Replacement Risk model (new) ---
 * calculateVulnerability: baseline risk (0.0–1.0) from focus_area + Human Pillars.
 * HVQ_DECAY_RATE: monthly "smarter world" decay; users must act to maintain score.
 * 
 * --- New (Replacement Risk) formula ---
 * HVQ = (HumanFloor × AILeverage) / (Vulnerability − DelegationBonus), capped [10, 1000].
 * - Human Floor: 50 + Σ (hvq_score_human × impact_weight) for added_completed human courses.
 * - AI Leverage: 1.5× if any added_paid tool, 1.1× if any added_free (multiplicative).
 * - DelegationBonus: 0.05 per task when vulnerability ≤ 0.7; 0.08 when > 0.7 (higher survival value at high replacement risk). Capped so denominator ≥ 0.01.
 * - Time decay: Score_final = Score_raw × (1 − HVQ_DECAY_RATE)^months since lastUpdatedAt.
 * 
 * @param data - efficiency_audit (delegate_to_machine); immediate_steps unused in new formula
 * @param resources - ai_tools and human_courses with id, hvq_score_human
 * @param resourceWeights - impact_weight per resource ID; multiplier on hvq_score_human
 * @param vulnerability - Baseline replacement risk [0,1] from calculateVulnerability
 * @param pathResourceStatus - resourceId → status (added_completed, added_paid, added_free)
 * @param primaryPillar - Optional. From GOAL_PILLAR_MAP[role]. 2× humanFloor when a course's hvq_primary_pillar matches.
 * @param lastUpdatedAt - Optional. Path's last update (Date, ISO string, or ms). Decay = (1 − HVQ_DECAY_RATE)^months since.
 * @returns HVQ in [10, 1000]
 */

// --- Replacement Risk model ---

/** How much the world gets "smarter" each month; users must act to maintain their score. */
export const HVQ_DECAY_RATE = 0.05

/** The 4 Human Pillars. Each is 0–1; higher = more human-centric, lower replacement risk. */
export interface HumanPillars {
  liability: number
  context: number
  edgeCase: number
  connection: number
}

/** Keys for the four Human Pillars. */
export type HumanPillarKey = keyof HumanPillars

/**
 * Maps common roles to the primary Human Pillar that defines their "Human Moat".
 * Used to reward users 2× when completed human courses target their role's pillar.
 */
export const GOAL_PILLAR_MAP: Record<string, HumanPillarKey> = {
  Manager: "connection",
  Developer: "edgeCase",
  Nurse: "liability",
  Founder: "context",
  Sales: "connection",
  Designer: "context",
  Teacher: "connection",
  Engineer: "edgeCase",
}

/** Threshold above which a single pillar triggers the "Pillar Power" boost. */
export const PILLAR_POWER_THRESHOLD = 0.8
/** When any pillar > PILLAR_POWER_THRESHOLD, vulnerability is reduced by this fraction (e.g. 0.2 = 20%). */
export const PILLAR_POWER_REDUCTION = 0.2

/**
 * Computes baseline replacement risk (0.0 to 1.0) from focus_area and the 4 Human Pillars.
 * High-pillar goals (strong human dimensions) yield lower initial vulnerability.
 * Pillar Power: if any single pillar > 0.8, final vulnerability is reduced by an extra 20%
 * (e.g. Yoga Instructor with 0.9 Connection gets a large score boost).
 *
 * @param focus_area - The path's focus area (e.g. from role/focus selection).
 * @param pillars - Scores for Liability, Context, Edge Case, Connection (each 0–1).
 * @returns Baseline vulnerability in [0, 1].
 */
export function calculateVulnerability(
  focus_area: string,
  pillars: HumanPillars
): number {
  const { liability, context, edgeCase, connection } = pillars
  const pillarMean = (liability + context + edgeCase + connection) / 4
  // High pillars → lower vulnerability
  let v = 1 - pillarMean
  // TODO: apply focus_area modifier (e.g. different baselines per focus)
  const focusModifier = 1.0
  v *= focusModifier
  // Pillar Power: if any single pillar > 0.8, reduce vulnerability by an extra 20%
  const hasPillarPower = liability > PILLAR_POWER_THRESHOLD || context > PILLAR_POWER_THRESHOLD || edgeCase > PILLAR_POWER_THRESHOLD || connection > PILLAR_POWER_THRESHOLD
  if (hasPillarPower) v *= 1 - PILLAR_POWER_REDUCTION
  return Math.max(0, Math.min(1, v))
}

// --- Resource shape (human_courses may include hvq_primary_pillar) ---

interface ResourceItem {
  id?: string
  hvq_score_machine?: number
  hvq_score_human?: number
  /** When set, human course targets this pillar; 2× to humanFloor if it matches primaryPillar. */
  hvq_primary_pillar?: string
}

// --- Constants for new HVQ formula ---
// Scoring is balanced so 500 = Professional, 1000 = near-total automation + master skills

const HUMAN_FLOOR_BASE = 50
const HVQ_CAP = 1000
const HVQ_MIN = 10
/** Scaling factor to make higher scores harder to achieve (applied after base calculation) */
const SCORE_SCALING_FACTOR = 0.7
/** Risk reduction per completed delegate task (8% reduction per task, multiplicative). Softer than before. */
export const DELEGATION_RISK_REDUCTION = 0.92
const MIN_DENOMINATOR = 0.01
/** Human Mastery Bonus per fortified "Keep for Human" task. */
export const HUMAN_MASTERY_BONUS_PER_TASK = 10
/** Flat bonus when a completed human course's hvq_primary_pillar matches the user's primaryPillar. */
const HUMAN_MOAT_MULTIPLIER = 1.3
/** Flat bonus amount added when pillar matches (instead of multiplier). */
const HUMAN_MOAT_BONUS = 15
/** Execution bonus per completed step. Rewards implementation. */
export const EXECUTION_BONUS_PER_STEP = 10

/** Parse lastUpdatedAt to UTC ms. Avoids local-timezone parsing for ISO strings without Z/offset. */
function toUtcTimestamp(val: Date | string | number | null | undefined): number {
  if (val == null) return NaN
  if (typeof val === "number") return Number.isFinite(val) ? val : NaN
  if (val instanceof Date) return val.getTime()
  const s = String(val).trim()
  if (!s) return NaN
  // ISO datetime without Z or ±offset is parsed as local time in JS; treat as UTC to avoid timezone skew
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/i.test(s)) return new Date(s + "Z").getTime()
  return new Date(s).getTime()
}

export function calculateHVQScore(
  data: {
    efficiency_audit?: {
      delegate_to_machine?: Array<{ is_completed: boolean }>
      keep_for_human?: Array<{ task: string; is_completed?: boolean; is_fortified?: boolean }>
    }
    immediate_steps?: Array<{ is_completed: boolean }>
  },
  resources: {
    ai_tools: ResourceItem[]
    human_courses: ResourceItem[]
  },
  resourceWeights: Record<string, number>,
  vulnerability: number,
  pathResourceStatus: Record<string, string>,
  /** Primary pillar for the user's role (e.g. from GOAL_PILLAR_MAP[role]). 2× humanFloor when a course's hvq_primary_pillar matches. */
  primaryPillar?: string,
  /** Path's last update. Score_raw × (1 − HVQ_DECAY_RATE)^months. Omit for no decay. */
  lastUpdatedAt?: Date | string | number | null
): number {
  // Human Floor: 50 + Σ ((hvq_score_human × impact_weight) + moat_bonus) for added_completed human courses
  // moat_bonus = +15 when hvq_primary_pillar matches primaryPillar (flat bonus, not multiplier)
  let humanFloor = HUMAN_FLOOR_BASE
  
  for (const c of resources.human_courses || []) {
    if (c.id && pathResourceStatus[c.id] === "added_completed") {
      const w = resourceWeights[c.id] ?? 1
      const courseScore = c.hvq_score_human ?? 0
      const hasMoatMatch = primaryPillar && c.hvq_primary_pillar && c.hvq_primary_pillar === primaryPillar
      const baseContribution = courseScore * w
      const moatBonus = hasMoatMatch ? HUMAN_MOAT_BONUS : 0
      const added = baseContribution + moatBonus
      humanFloor += added
    }
  }
  
  // Human Mastery Bonus: +10 per fortified "Keep for Human" task (using is_fortified)
  const fortifiedKeepForHuman = (data.efficiency_audit?.keep_for_human || []).filter(
    (item) => item.is_fortified === true
  ).length
  const humanMasteryBonus = fortifiedKeepForHuman * HUMAN_MASTERY_BONUS_PER_TASK
  humanFloor += humanMasteryBonus

  // AI Leverage: Additive on Human Floor (humanFloor * (1 + 0.2 if paid + 0.05 if free))
  const hasPaid = (resources.ai_tools || []).some(
    (t) => t.id && pathResourceStatus[t.id] === "added_paid"
  )
  const hasFree = (resources.ai_tools || []).some(
    (t) => t.id && pathResourceStatus[t.id] === "added_free"
  )
  const aiLeverageMultiplier = 1 + (hasPaid ? 0.2 : 0) + (hasFree ? 0.05 : 0)
  const humanFloorWithAILeverage = humanFloor * aiLeverageMultiplier

  // Denominator: vulnerability * Math.pow(0.92, completedDelegateTasks)
  // Each completed task reduces risk by 8% (softer multiplicative decay)
  const completedDelegate = (data.efficiency_audit?.delegate_to_machine || []).filter(
    (t) => t.is_completed
  ).length
  const riskReduction = Math.pow(DELEGATION_RISK_REDUCTION, completedDelegate)
  const denominator = vulnerability * riskReduction

  const raw = humanFloorWithAILeverage / Math.max(0.01, denominator)

  // Execution Bonus: +10 points per completed step (rewards implementation)
  // Moved before scaling so bonus is included in scaling calculation
  const completedSteps = (data.immediate_steps || []).filter((step) => step.is_completed).length
  const executionBonus = completedSteps * EXECUTION_BONUS_PER_STEP
  const rawWithBonus = raw + executionBonus

  // Apply power function scaling for scores above 500 to prevent rapid saturation
  // Makes reaching 1000 feel like 'Level 99' in a game
  let scaledRaw = rawWithBonus
  if (rawWithBonus > 500) {
    // Power function dampener: 500 + (excess ^ 0.75)
    // This creates stronger diminishing returns for scores above 500
    const excess = rawWithBonus - 500
    const dampenedExcess = Math.pow(excess, 0.75)
    scaledRaw = 500 + dampenedExcess
  }

  // Time decay: Score_final = Score_scaled × (1 − HVQ_DECAY_RATE)^months (Replacement Risk as AI improves)
  // Use UTC timestamps only (Date.now() and getTime() are UTC) to avoid timezone-related score drops.
  // lastUpdatedAt should be ISO 8601 with Z or offset; if it's ISO datetime without timezone, we treat as UTC.
  const MS_PER_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000
  const then = toUtcTimestamp(lastUpdatedAt)
  const months = Number.isFinite(then) ? Math.max(0, (Date.now() - then) / MS_PER_MONTH) : 0
  const decay = Math.pow(1 - HVQ_DECAY_RATE, months)
  const scoreDecayed = scaledRaw * decay

  const final = Math.max(HVQ_MIN, Math.min(HVQ_CAP, Math.round(scoreDecayed)))
  return final
}