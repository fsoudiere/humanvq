"use client"

import { useState, useEffect } from "react"
import { Share2, Globe, Lock, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { togglePathPrivacy } from "@/actions/paths"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"

interface SharePathButtonProps {
  pathId: string
  initialIsPublic: boolean
}

export function SharePathButton({ pathId, initialIsPublic }: SharePathButtonProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [isUpdating, setIsUpdating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [username, setUsername] = useState<string | null>(null)
  const [hasUsername, setHasUsername] = useState(false)
  const router = useRouter()

  // Fetch username when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      const fetchUsername = async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, user_id")
            .eq("user_id", user.id)
            .maybeSingle()
          
          const userUsername = profile?.username
          setHasUsername(!!userUsername)
          setUsername(userUsername || user.id)
          
          // Generate share URL
          const baseUrl = window.location.origin
          if (userUsername) {
            setShareUrl(`${baseUrl}/u/${userUsername}/${pathId}`)
          } else {
            setShareUrl(`${baseUrl}/u/${user.id}/${pathId}`)
          }
        }
      }
      fetchUsername()
    }
  }, [dialogOpen, pathId])

  const handlePublish = async () => {
    setIsUpdating(true)
    try {
      const result = await togglePathPrivacy(pathId, true)
      if (result.success) {
        setIsPublic(true)
        // Refresh username and slug after publishing - keep dialog open
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Fetch profile for username
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, user_id")
            .eq("user_id", user.id)
            .maybeSingle()
          
          // Fetch path for slug
          const { data: path } = await supabase
            .from("upgrade_paths")
            .select("slug")
            .eq("id", pathId)
            .eq("user_id", user.id)
            .maybeSingle()
          
          const userUsername = profile?.username || user.id
          const pathSlug = path?.slug
          const baseUrl = window.location.origin
          
          // Generate URL using slug
          if (userUsername && pathSlug) {
            setShareUrl(`${baseUrl}/u/${userUsername}/${pathSlug}`)
          } else if (pathSlug) {
            setShareUrl(`${baseUrl}/u/${user.id}/${pathSlug}`)
          } else {
            // Fallback to pathId if no slug (shouldn't happen)
            setShareUrl(`${baseUrl}/u/${userUsername}/${pathId}`)
          }
          
          setHasUsername(!!profile?.username)
          setUsername(userUsername)
        }
        // Keep dialog open to show the share link
        router.refresh()
      } else {
        setIsUpdating(false)
        alert(result.error || "Failed to publish path")
      }
    } catch (error) {
      console.error("Error publishing path:", error)
      setIsUpdating(false)
      alert("An error occurred while publishing the path")
    }
  }

  const handleMakePrivate = async () => {
    setIsUpdating(true)
    try {
      const result = await togglePathPrivacy(pathId, false)
      if (result.success) {
        setIsPublic(false)
        router.refresh()
      } else {
        alert(result.error || "Failed to make path private")
      }
    } catch (error) {
      console.error("Error making path private:", error)
      alert("An error occurred while making the path private")
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
      alert("Failed to copy link. Please copy it manually.")
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        {isPublic ? (
          <>
            {/* If already public, show share link */}
            <DialogHeader>
              <DialogTitle>Share Your Strategy</DialogTitle>
              <DialogDescription>
                Anyone with this link can view your HVQ score and plan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="share-url">Shareable Link</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-url"
                    value={shareUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    onClick={handleCopyLink}
                    size="sm"
                    variant="outline"
                    className="gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                {!hasUsername && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                    💡 Set a username in Settings to get a custom URL!
                  </p>
                )}
              </div>
              <div className="pt-4 border-t">
                <Button
                  onClick={handleMakePrivate}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300"
                  disabled={isUpdating}
                >
                  <Lock className="h-4 w-4" />
                  Make Private
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* If not public, show publish dialog */}
            <DialogHeader>
              <DialogTitle>Publish This Strategy?</DialogTitle>
              <DialogDescription>
                Making this public allows anyone with the link to view your HVQ score and plan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>What will be visible:</strong>
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside">
                  <li>Your HVQ score</li>
                  <li>Role, goal, and context</li>
                  <li>Efficiency audit and recommendations</li>
                  <li>AI tools and courses</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handlePublish}
                  disabled={isUpdating}
                  className="flex-1 gap-2"
                >
                  <Globe className="h-4 w-4" />
                  {isUpdating ? "Publishing..." : "Confirm & Publish"}
                </Button>
                <Button
                  onClick={() => setDialogOpen(false)}
                  variant="outline"
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
