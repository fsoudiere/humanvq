"use client"

import { useState, useRef, useEffect } from "react"
import { Pencil } from "lucide-react"
import { updatePathTitle } from "@/actions/update-path-title"

interface EditablePathTitleProps {
  pathId: string
  initialTitle: string
  onUpdate?: (title: string) => void
}

export function EditablePathTitle({ pathId, initialTitle, onUpdate }: EditablePathTitleProps) {
  const [title, setTitle] = useState(initialTitle)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = async () => {
    if (title.trim() === "" || title === initialTitle) {
      setTitle(initialTitle)
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    try {
      const result = await updatePathTitle(pathId, title.trim())
      if (result.success) {
        setIsEditing(false)
        onUpdate?.(title.trim())
      } else {
        alert(result.error || "Failed to update title")
        setTitle(initialTitle)
      }
    } catch (error) {
      console.error("Error updating title:", error)
      alert("An error occurred while updating the title")
      setTitle(initialTitle)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      setTitle(initialTitle)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 w-full">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="flex-1 text-4xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none focus:border-blue-600 dark:border-blue-400 dark:focus:border-blue-300 px-2 py-1"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 group">
      <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
        {title || "Untitled Path"}
      </h1>
      <button
        onClick={() => setIsEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        title="Edit title"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}
