"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { deletePath } from "@/actions/delete-path"
import { useRouter } from "next/navigation"

interface DeletePathButtonProps {
  pathId: string
}

export function DeletePathButton({ pathId }: DeletePathButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm("Are you sure you want to delete this path? This action cannot be undone.")) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deletePath(pathId)
      if (result.success) {
        // Redirect to portfolio hub after deletion
        const pathSegments = window.location.pathname.split('/')
        const userId = pathSegments[2] // Extract userId from path
        router.push(`/stack/${userId}`)
      } else {
        alert(result.error || "Failed to delete path")
        setIsDeleting(false)
      }
    } catch (error) {
      console.error("Error deleting path:", error)
      alert("An error occurred while deleting the path")
      setIsDeleting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20 border-red-200 dark:border-red-800"
      title="Delete path"
    >
      <Trash2 className="h-4 w-4" />
      Delete Path
    </Button>
  )
}
