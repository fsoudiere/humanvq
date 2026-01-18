"use client"

import { useState, useEffect } from "react"
import { Share2, Globe, Lock, Copy, Check, Twitter, Linkedin, Facebook, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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
import { togglePathPublicStatus } from "@/actions/toggle-path-public-status"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { toJpeg } from "html-to-image"

interface ShareButtonProps {
  targetType: 'path' | 'stack'
  targetId: string // pathId for 'path', userId for 'stack'
  isOwner: boolean
  initialVisibility?: boolean // Only used for 'path' type
  // Optional metadata for better social sharing
  pathTitle?: string // For 'path' type
  userName?: string // For both types
  // Optional: custom button variant/size
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
  // Optional: show toggle as separate button (for inline use)
  showToggleOnly?: boolean
  // Optional: custom className for styling
  className?: string
}

export function ShareButton({
  targetType,
  targetId,
  isOwner,
  initialVisibility = false,
  pathTitle,
  userName,
  variant = "outline",
  size = "sm",
  showToggleOnly = false,
  className,
}: ShareButtonProps) {
  const [isPublic, setIsPublic] = useState(initialVisibility)
  const [isUpdating, setIsUpdating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [username, setUsername] = useState<string | null>(null)
  const [hasUsername, setHasUsername] = useState(false)
  const [fetchedPathTitle, setFetchedPathTitle] = useState<string>("")
  const [fetchedUserName, setFetchedUserName] = useState<string>("")
  const router = useRouter()

  // Update isPublic when initialVisibility changes
  useEffect(() => {
    setIsPublic(initialVisibility)
  }, [initialVisibility])

  // Fetch URL data when dialog opens
  useEffect(() => {
    if (dialogOpen || showToggleOnly) {
      const fetchUrlData = async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user && targetType === 'path') return

        if (targetType === 'stack') {
          // Stack: Use userId to get username
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("user_id", targetId)
            .maybeSingle()
          
          const userUsername = profile?.username || targetId
          setShareUrl(`${window.location.origin}/u/${userUsername}`)
          setUsername(userUsername)
          setHasUsername(!!profile?.username)
        } else {
          // Path: Use pathId to get slug and username
          if (!user) return
          
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, user_id, full_name")
            .eq("user_id", user.id)
            .maybeSingle()
          
          const { data: path } = await supabase
            .from("upgrade_paths")
            .select("slug, path_title")
            .eq("id", targetId)
            .eq("user_id", user.id)
            .maybeSingle()
          
          const userUsername = profile?.username || user.id
          const pathSlug = path?.slug || targetId
          const baseUrl = window.location.origin
          
          setShareUrl(`${baseUrl}/u/${userUsername}/${pathSlug}`)
          setHasUsername(!!profile?.username)
          setUsername(userUsername)
          
          if (path?.path_title) {
            setFetchedPathTitle(path.path_title)
          }
          if (profile?.full_name) {
            setFetchedUserName(profile.full_name)
          }
        }
      }
      fetchUrlData()
    }
  }, [dialogOpen, targetId, targetType, showToggleOnly])

  // Toggle visibility (only for paths)
  const handleToggleVisibility = async () => {
    if (targetType !== 'path') return
    
    const newValue = !isPublic
    setIsPublic(newValue)
    setIsUpdating(true)

    try {
      const result = await togglePathPublicStatus(targetId, newValue)
      if (!result.success) {
        // Revert on error
        setIsPublic(!newValue)
        alert(result.error || "Failed to update visibility")
      } else {
        // Refresh to show updated state
        router.refresh()
      }
    } catch (error) {
      console.error("Error toggling visibility:", error)
      // Revert on error
      setIsPublic(!newValue)
      alert("An error occurred while updating visibility")
    } finally {
      setIsUpdating(false)
    }
  }

  // Publish path (set to public)
  const handlePublish = async () => {
    setIsUpdating(true)
    try {
      const result = await togglePathPublicStatus(targetId, true)
      if (result.success) {
        setIsPublic(true)
        // Refresh URL data after publishing
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, user_id, full_name")
            .eq("user_id", user.id)
            .maybeSingle()
          
          const { data: path } = await supabase
            .from("upgrade_paths")
            .select("slug, path_title")
            .eq("id", targetId)
            .eq("user_id", user.id)
            .maybeSingle()
          
          const userUsername = profile?.username || user.id
          const pathSlug = path?.slug
          const baseUrl = window.location.origin
          
          if (userUsername && pathSlug) {
            setShareUrl(`${baseUrl}/u/${userUsername}/${pathSlug}`)
          }
          
          setHasUsername(!!profile?.username)
          setUsername(userUsername)
          
          if (path?.path_title) {
            setFetchedPathTitle(path.path_title)
          }
          if (profile?.full_name) {
            setFetchedUserName(profile.full_name)
          }
        }
        router.refresh()
      } else {
        setIsUpdating(false)
        alert(result.error || "Failed to publish")
      }
    } catch (error) {
      console.error("Error publishing:", error)
      setIsUpdating(false)
      alert("An error occurred while publishing")
    }
  }

  // Make path private
  const handleMakePrivate = async () => {
    setIsUpdating(true)
    try {
      const result = await togglePathPublicStatus(targetId, false)
      if (result.success) {
        setIsPublic(false)
        router.refresh()
      } else {
        alert(result.error || "Failed to make private")
      }
    } catch (error) {
      console.error("Error making private:", error)
      alert("An error occurred while making private")
    } finally {
      setIsUpdating(false)
    }
  }

  // Copy link to clipboard
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

  // Download image (only for stacks)
  const handleDownloadImage = async () => {
    if (targetType !== 'stack') return
    
    const element = document.getElementById("stack-capture")
    if (!element) return

    setDownloading(true)
    
    try {
      const filter = (node: HTMLElement) => {
        const exclusionClasses = ['hide-on-export']
        return !exclusionClasses.some((classname) => node.classList?.contains(classname))
      }

      const dataUrl = await toJpeg(element, { 
        quality: 0.95, 
        backgroundColor: '#ffffff', 
        filter: filter as any, 
        pixelRatio: 2 
      })

      const link = document.createElement("a")
      link.download = `${(userName || "stack").replace(/\s+/g, '-').toLowerCase()}-stack.jpg`
      link.href = dataUrl
      link.click()

    } catch (error) {
      console.error("Failed to generate image", error)
    } finally {
      setDownloading(false)
    }
  }

  // Social share links
  const getSocialLinks = () => {
    const finalPathTitle = pathTitle || fetchedPathTitle
    const finalUserName = userName || fetchedUserName || "My"
    
    let shareText: string
    if (targetType === 'path') {
      shareText = finalPathTitle 
        ? `Check out "${finalPathTitle}" - ${finalUserName} AI Strategy! Generated by AI Stack Builder.`
        : `Check out ${finalUserName} AI Strategy! Generated by AI Stack Builder.`
    } else {
      shareText = `Check out ${finalUserName}'s AI Stack! Generated by AI Stack Builder.`
    }
    
    return [
      {
        icon: <Twitter className="w-4 h-4" />,
        label: "X (Twitter)",
        href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
      },
      {
        icon: <Linkedin className="w-4 h-4" />,
        label: "LinkedIn",
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
      },
      {
        icon: <Facebook className="w-4 h-4" />,
        label: "Facebook",
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
      }
    ]
  }

  // If showToggleOnly is true, render just the toggle button (for inline use)
  if (showToggleOnly && targetType === 'path' && isOwner) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={handleToggleVisibility}
        disabled={isUpdating}
        className={cn(
          "gap-2",
          isPublic
            ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-950/20 border-blue-200 dark:border-blue-800"
            : "text-zinc-600 hover:text-zinc-700 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-zinc-950/20",
          className
        )}
        title={isPublic ? "Make private" : "Make public"}
      >
        {isPublic ? (
          <>
            <Globe className="h-4 w-4" />
            Public
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Private
          </>
        )}
      </Button>
    )
  }

  // Main share dialog button (only show if owner or if path is public)
  if (!isOwner && targetType === 'path' && !isPublic) {
    return null // Don't show share button if not owner and path is private
  }

  const isIconOnly = size === "icon"
  
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={cn(isIconOnly ? "" : "gap-2", className)}>
          {targetType === 'path' && isPublic ? (
            <Globe className="h-4 w-4" />
          ) : targetType === 'path' && !isPublic ? (
            <Lock className="h-4 w-4" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {!isIconOnly && "Share"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {targetType === 'path' && !isPublic ? (
          <>
            {/* Publish dialog for private paths */}
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
        ) : (
          <>
            {/* Share dialog for public paths or stacks */}
            <DialogHeader>
              <DialogTitle>Share {targetType === 'path' ? 'Your Strategy' : 'Public Link'}</DialogTitle>
              <DialogDescription>
                {targetType === 'path' 
                  ? "Anyone with this link can view your HVQ score and plan."
                  : "Share this stack with the world or download it as an image."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Copy Link Section */}
              <div className="space-y-2">
                <Label htmlFor="share-url" className="text-xs font-semibold text-zinc-500">
                  PUBLIC LINK
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="share-url"
                    value={shareUrl}
                    readOnly
                    className="font-mono text-sm bg-zinc-50 border-zinc-200 text-zinc-600"
                  />
                  <Button
                    onClick={handleCopyLink}
                    size="sm"
                    variant="outline"
                    className={copied ? "bg-green-600 hover:bg-green-700 text-white" : "bg-zinc-900 text-white"}
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

              {/* Social Media Sharing */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-zinc-500">SHARE TO SOCIAL</Label>
                <div className="grid grid-cols-3 gap-2">
                  {getSocialLinks().map((s) => (
                    <a 
                      key={s.label} 
                      href={s.href} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="w-full"
                    >
                      <Button variant="outline" className="w-full gap-2 text-xs border-zinc-200 hover:bg-zinc-50">
                        {s.icon} {s.label}
                      </Button>
                    </a>
                  ))}
                </div>
              </div>

              {/* Download Image (only for stacks) */}
              {targetType === 'stack' && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-zinc-500">EXPORT</Label>
                  <Button 
                    onClick={handleDownloadImage} 
                    variant="outline"
                    className="w-full gap-2 border-dashed border-zinc-300 hover:bg-zinc-50 h-12"
                    disabled={downloading}
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Generating Image...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" /> Download High-Res Image (JPG)
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Make Private Button (only for paths) */}
              {targetType === 'path' && isOwner && (
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
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
