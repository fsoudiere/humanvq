"use client"

export interface KnowledgeDecayBannerProps {
  /** When true, the banner is shown. */
  show: boolean
  /** Current HVQ from calculateHVQScore (with decay). Passed for correctness and potential display. */
  calculatedScore: number | null
  /** Last recorded/persisted HVQ. Passed for correctness and potential display. */
  lastRecordedScore: number | null | undefined
  /** Decay rate as percent (e.g. 5 for HVQ_DECAY_RATE 0.05). */
  decayRatePercent: number
}

export function KnowledgeDecayBanner({
  show,
  calculatedScore: _calculatedScore,
  lastRecordedScore: _lastRecordedScore,
  decayRatePercent,
}: KnowledgeDecayBannerProps) {
  if (!show) return null

  return (
    <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Knowledge Decay</p>
      <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
        Your HVQ is stagnating. The AI era is moving {decayRatePercent}% faster than your current
        skill updates. Add a new tool to regain momentum.
      </p>
    </div>
  )
}
