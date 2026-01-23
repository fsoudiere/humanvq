"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface AbsoluteTooltipProps {
  children: React.ReactNode
  content: string
  side?: "left" | "right" | "top" | "bottom"
  className?: string
}

export function AbsoluteTooltip({ 
  children, 
  content, 
  side = "right",
  className 
}: AbsoluteTooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const positionClasses = {
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  }

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {children}
      {isOpen && (
        <div
          className={cn(
            "absolute z-50 rounded-md border border-zinc-200 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-50 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 leading-relaxed",
            positionClasses[side],
            className
          )}
          style={{ 
            pointerEvents: 'none',
            maxWidth: '200px'
          }}
        >
          {content}
          {/* Arrow */}
          <div
            className={cn(
              "absolute w-0 h-0 border-4",
              side === "left" && "right-0 top-1/2 -translate-y-1/2 translate-x-full border-l-zinc-900 border-t-transparent border-b-transparent border-r-transparent dark:border-l-zinc-950",
              side === "right" && "left-0 top-1/2 -translate-y-1/2 -translate-x-full border-r-zinc-900 border-t-transparent border-b-transparent border-l-transparent dark:border-r-zinc-950",
              side === "top" && "bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-t-zinc-900 border-l-transparent border-r-transparent border-b-transparent dark:border-t-zinc-950",
              side === "bottom" && "top-0 left-1/2 -translate-x-1/2 -translate-y-full border-b-zinc-900 border-l-transparent border-r-transparent border-t-transparent dark:border-b-zinc-950"
            )}
          />
        </div>
      )}
    </div>
  )
}
