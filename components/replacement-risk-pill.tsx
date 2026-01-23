"use client"

import { AbsoluteTooltip } from "@/components/absolute-tooltip"
import { cn } from "@/lib/utils"

interface ReplacementRiskPillProps {
  riskPercent: number
  isRiskFree: boolean
  isHumanGate: boolean
}

export function ReplacementRiskPill({ riskPercent, isRiskFree, isHumanGate }: ReplacementRiskPillProps) {
  if (isRiskFree) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-sm">
        Risk Free
      </span>
    )
  }

  if (isHumanGate) {
    return (
      <AbsoluteTooltip
        content="Logistics automated, but your Human Moat is still thin. Complete 1 course to reach 0% risk."
        side="right"
        className="max-w-xs whitespace-normal"
      >
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-sm cursor-help">
          {riskPercent}% Risk Left
        </span>
      </AbsoluteTooltip>
    )
  }

  // Partial risk (< 50%) or High risk (>= 50%)
  if (riskPercent < 50) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-sm">
        {riskPercent}% Automatable
      </span>
    )
  }

  // High risk (>= 50%)
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-sm">
      {riskPercent}% Automatable
    </span>
  )
}
