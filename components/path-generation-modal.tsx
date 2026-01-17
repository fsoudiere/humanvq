"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Loader2, CheckCircle2, Circle } from "lucide-react"

interface PathGenerationModalProps {
  isOpen: boolean
  currentStep: number
}

const STEPS = [
  { label: "Analysing your profile" },
  { label: "Finding the best tools for you" },
  { label: "Discovering relevant courses" },
  { label: "Generating your upgrade path" },
]

export function PathGenerationModal({ isOpen, currentStep }: PathGenerationModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Creating Your Upgrade Path</DialogTitle>
          <DialogDescription>
            We're analyzing your profile and crafting a personalized path to upgrade your human moat.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-6">
          {STEPS.map((step, index) => {
            const stepNumber = index + 1
            const isActive = stepNumber === currentStep
            const isComplete = stepNumber < currentStep
            
            return (
              <div key={index} className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : isActive ? (
                    <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                  ) : (
                    <Circle className="h-6 w-6 text-zinc-300" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    isComplete ? 'text-green-600' : 
                    isActive ? 'text-blue-600' : 
                    'text-zinc-500'
                  }`}>
                    {step.label}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}