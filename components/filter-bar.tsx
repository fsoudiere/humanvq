"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FilterBarProps {
  paths: Array<{ id: string; path_title?: string; main_goal?: string }>
  statuses: string[]
  selectedPathId: string | null
  selectedStatus: string | null
  onPathChange: (pathId: string | null) => void
  onStatusChange: (status: string | null) => void
}

export function FilterBar({
  paths,
  statuses,
  selectedPathId,
  selectedStatus,
  onPathChange,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-4 mb-6">
      {/* Path Filter */}
      <div className="flex-1 min-w-[200px]">
        <Label htmlFor="path-filter" className="text-sm md:text-xs text-zinc-500 mb-2 block">
          Filter by Moat
        </Label>
        <Select
          value={selectedPathId || "all"}
          onValueChange={(value) => onPathChange(value === "all" ? null : value)}
        >
          <SelectTrigger id="path-filter" className="w-full bg-white border-zinc-200">
            <SelectValue placeholder="All Moats" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Moats</SelectItem>
            {paths.map((path) => (
              <SelectItem key={path.id} value={path.id}>
                {path.path_title || path.main_goal || "Untitled Path"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status Filter - Only show if statuses are provided */}
      {statuses.length > 0 && (
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="status-filter" className="text-sm md:text-xs text-zinc-500 mb-2 block">
            Filter by Status
          </Label>
          <Select
            value={selectedStatus || "all"}
            onValueChange={(value) => onStatusChange(value === "all" ? null : value)}
          >
            <SelectTrigger id="status-filter" className="w-full bg-white border-zinc-200">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}