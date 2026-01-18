"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateResourceStatus } from "@/actions/path-resources"
import { useRouter } from "next/navigation"

interface RemoveFromPathButtonProps {
  pathId: string
  resourceId: string
  onStatusChange?: (newStatus?: string) => void
}

export function RemoveFromPathButton({ pathId, resourceId, onStatusChange }: RemoveFromPathButtonProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const router = useRouter()

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!pathId || !resourceId) return
    
    setIsRemoving(true)
    const result = await updateResourceStatus(pathId, resourceId, 'removed')
    if (result.success) {
      if (onStatusChange) onStatusChange('removed')
      router.refresh()
    } else {
      alert(result.error || "Failed to remove from path")
      setIsRemoving(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={handleRemove}
      disabled={isRemoving}
      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20 border-red-200 dark:border-red-800"
      title="Remove from path"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )
}
