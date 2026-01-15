"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog"
import { Loader2, Sparkles } from "lucide-react"
import { submitSuggestion } from "@/actions/suggestions" // Your server action

export default function AddMissingResourceModal({ 
  isOpen, 
  onClose, 
  initialName,
  userId 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  initialName: string;
  userId: string;
}) {
  const [url, setUrl] = useState("")
  const [type, setType] = useState("ai_tool")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!url) return alert("Please add a URL")
    setLoading(true)

    // Using the Server Action you provided
    const result = await submitSuggestion({
      name: initialName,
      url: url,
      type: type
    })

    if (result.success) {
      alert("Magic is happening! n8n is adding this to your stack now...")
      onClose()
      setUrl("") // Reset
    } else {
      alert("Error: " + result.error)
    }
    setLoading(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            Add to your Stack
          </DialogTitle>
          <DialogDescription>
            <strong>{initialName}</strong> isn't in our library yet. Give us the link and our AI will do the rest.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* URL Input */}
          <div className="grid gap-2">
            <Label htmlFor="url" className="text-zinc-500">Website URL</Label>
            <Input 
              id="url" 
              placeholder="https://chatgpt.com" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)}
              className="border-zinc-200"
            />
          </div>

          {/* Type Selector */}
          <div className="grid gap-2">
            <Label className="text-zinc-500">What is this?</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === "ai_tool" ? "default" : "outline"}
                onClick={() => setType("ai_tool")}
                className="flex-1"
              >
                AI Tool
              </Button>
              <Button
                type="button"
                variant={type === "human_course" ? "default" : "outline"}
                onClick={() => setType("human_course")}
                className="flex-1"
              >
                Course
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleSubmit} 
            disabled={loading} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full h-12"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Suggest & Add to Stack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}