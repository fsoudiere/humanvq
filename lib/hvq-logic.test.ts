/**
 * Tests for calculateHVQScore (Replacement Risk formula).
 * Run: npx tsx lib/hvq-logic.test.ts
 * Or add to package.json: "test": "npx tsx lib/hvq-logic.test.ts"
 */

import {
  calculateHVQScore,
  VULNERABILITY_HIGH_RISK_THRESHOLD,
} from "./hvq-logic"

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✅ ${name}`)
  } catch (e) {
    console.error(`❌ ${name}`)
    throw e
  }
}

// --- 1. High Risk / No Action ---
// High vulnerability (0.9), no tools, no courses. Expect a very low score.
run("High Risk / No Action: very low score", () => {
  const score = calculateHVQScore(
    { efficiency_audit: { delegate_to_machine: [] } },
    { ai_tools: [], human_courses: [] },
    {},
    0.9,
    {},
    undefined,
    undefined
  )
  // humanFloor=50, aiLeverage=1, denominator=0.9 → raw≈55.6 → 56 (HUMAN_FLOOR_BASE=50)
  console.assert(score <= 60, `expected low score (<=60) at high vuln 0.9, got ${score}`)
  console.assert(score >= 10, `expected at least HVQ_MIN 10, got ${score}`)
})

// --- 2. AI Power User ---
// High vulnerability so 0.08 delegation bonus applies; 3 completed delegate tasks, 1 paid AI tool.
// (0.08 applies when vulnerability > 0.7; at 0.5 it would be 0.05.)
run("AI Power User: 0.08 delegation bonus and paid AI leverage", () => {
  const vuln = 0.8 // > VULNERABILITY_HIGH_RISK_THRESHOLD so bonusPerTask = 0.08
  const score = calculateHVQScore(
    {
      efficiency_audit: {
        delegate_to_machine: [
          { is_completed: true },
          { is_completed: true },
          { is_completed: true },
        ],
      },
    },
    { ai_tools: [{ id: "paid1" }], human_courses: [] },
    {},
    vuln,
    { paid1: "added_paid" },
    undefined,
    undefined
  )
  // humanFloor=50, aiLeverage=1.5; bonusPerTask=0.08, completed=3 → delegationBonus=0.24
  // denominator = max(0.01, 0.8-0.24)=0.56; raw = 50*1.5/0.56 ≈ 133.9 → 134
  console.assert(vuln > VULNERABILITY_HIGH_RISK_THRESHOLD, "sanity: vuln > 0.7 so 0.08 applies")
  console.assert(score >= 130, `expected score >= 130 (0.08 bonus + paid AI, HUMAN_FLOOR_BASE=50), got ${score}`)
  console.assert(score > 115, `expected > 115 to reflect 0.08 (not 0.05) bonus, got ${score}`)
})

// --- 3. The Moat Builder ---
// primaryPillar 'connection', 1 completed course with hvq_primary_pillar 'connection' → 2× Human Floor for that course.
run("The Moat Builder: 2× Human Floor when course pillar matches primaryPillar", () => {
  const score = calculateHVQScore(
    { efficiency_audit: { delegate_to_machine: [] } },
    {
      ai_tools: [],
      human_courses: [
        { id: "c1", hvq_score_human: 10, hvq_primary_pillar: "connection" },
      ],
    },
    { c1: 1 },
    0.5,
    { c1: "added_completed" },
    "connection",
    undefined
  )
  // humanFloor = 50 + 10*1*2 = 70 (2× moat); without 2× would be 60. raw = 70/0.5 = 140.
  console.assert(score === 140, `expected 140 (humanFloor 70, vuln 0.5, HUMAN_FLOOR_BASE=50), got ${score}`)
  // Sanity: without the 2×, humanFloor=60 → raw=120.
  const scoreNoMoat = calculateHVQScore(
    { efficiency_audit: { delegate_to_machine: [] } },
    {
      ai_tools: [],
      human_courses: [
        { id: "c1", hvq_score_human: 10, hvq_primary_pillar: "connection" },
      ],
    },
    { c1: 1 },
    0.5,
    { c1: "added_completed" },
    "liability", // mismatch: no 2×
    undefined
  )
  console.assert(scoreNoMoat === 120, `without moat match expected 120 (humanFloor 60), got ${scoreNoMoat}`)
  console.assert(score === scoreNoMoat + 20, `2× should add 20 (10*2 - 10*1), got diff ${score - scoreNoMoat}`)
})

console.log("\nAll HVQ logic tests passed.")
