"use client"

import { Card } from "@/components/ui/card"
import { VULNERABILITY_HIGH_RISK_THRESHOLD } from "@/lib/hvq-logic"

export interface ReplacementRiskGaugeProps {
  /** Vulnerability 0–1 from calculateVulnerability. */
  pathVulnerability: number
}

export function ReplacementRiskGauge({ pathVulnerability }: ReplacementRiskGaugeProps) {
  const pct = Math.round(pathVulnerability * 100)
  const isHighRisk = pathVulnerability > VULNERABILITY_HIGH_RISK_THRESHOLD

  return (
    <Card
      className={`p-3 border ${
        isHighRisk
          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
          : "bg-zinc-50 dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm md:text-xs text-zinc-600 dark:text-zinc-400">Replacement Risk</div>
      </div>
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isHighRisk
                ? "bg-amber-500 dark:bg-amber-500"
                : pathVulnerability > 0.4
                  ? "bg-amber-400 dark:bg-amber-600"
                  : "bg-emerald-500 dark:bg-emerald-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">{pct}% automatable</div>
        {isHighRisk && (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            High Priority: Your role is currently {pct}% automatable.
          </p>
        )}
      </div>
    </Card>
  )
}
