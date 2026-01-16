"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { generatePath } from "@/actions/generate-path"
import { updatePathStrategy } from "@/actions/update-path-strategy"
import { createClient } from "@/utils/supabase/client"
import { slugify } from "@/lib/slugify"
import { 
  Code2, 
  Megaphone, 
  Briefcase, 
  Rocket, 
  LineChart, 
  MoreHorizontal,
  CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"

interface IntakeFormData {
  currentRole: string
  bioContext: string
  mainGoal: string
}

interface IntakeFormInitialData {
  role?: string | null
  main_goal?: string | null
  context?: string | null
}

interface IntakeFormProps {
  onSuccess: () => void;
  pathId?: string;
  initialData?: IntakeFormInitialData;
  showCard?: boolean;
}

// 🎯 PRE-DEFINED ROLES CONFIGURATION
const PREDEFINED_ROLES = [
  { id: "founder", label: "Founder / Exec", icon: Rocket, value: "Founder or Executive" },
  { id: "product", label: "Product Manager", icon: Briefcase, value: "Product Manager" },
  { id: "dev", label: "Developer", icon: Code2, value: "Software Engineer" },
  { id: "marketing", label: "Marketing / Content", icon: Megaphone, value: "Marketing Specialist" },
  { id: "sales", label: "Sales / Biz Dev", icon: LineChart, value: "Sales Representative" },
  { id: "other", label: "Other / Custom", icon: MoreHorizontal, value: "custom" },
]

export function IntakeForm({ onSuccess, pathId, initialData, showCard = true }: IntakeFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWaitingForPath, setIsWaitingForPath] = useState(false)
  const [waitingPathId, setWaitingPathId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCustomRole, setShowCustomRole] = useState(false)
  const isEditMode = !!pathId && !!initialData

  // Initialize form with initialData if provided, otherwise empty
  const form = useForm<IntakeFormData>({
    defaultValues: {
      currentRole: initialData?.role || "",
      bioContext: initialData?.context || "",
      mainGoal: initialData?.main_goal || "",
    },
  })

  // Watch the current role to update UI selection state
  const currentRoleValue = form.watch("currentRole")

  // Auto-fill from LinkedIn (Only if creating new path, not editing)
  useEffect(() => {
    if (isEditMode) return // Skip LinkedIn auto-fill when editing

    const checkLinkedInData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const linkedInRole = user?.user_metadata?.headline || user?.user_metadata?.title
      
      // If we found a LinkedIn role and the form is empty, use it
      if (linkedInRole && !form.getValues("currentRole")) {
        form.setValue("currentRole", linkedInRole)
        setShowCustomRole(true) // Treat LinkedIn data as "custom" so they can edit it
      }
    }
    checkLinkedInData()
  }, [form, isEditMode])

  // Initialize showCustomRole based on whether initial role is in predefined list
  useEffect(() => {
    if (isEditMode && initialData?.role) {
      const isPredefined = PREDEFINED_ROLES.some(role => role.value === initialData.role)
      setShowCustomRole(!isPredefined)
    }
  }, [isEditMode, initialData])

  // Poll for slug readiness (Supabase trigger sets slug when path_title is processed)
  useEffect(() => {
    if (!isWaitingForPath || !waitingPathId) return

    let pollCount = 0
    const maxPolls = 40 // 40 * 3 seconds = 2 minutes max wait time
    const pollInterval = 3000 // 3 seconds

    const checkPathReady = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError("User not authenticated")
        setIsWaitingForPath(false)
        return
      }

      pollCount++
      console.log(`⏳ Polling for slug (attempt ${pollCount}/${maxPolls})...`)

      // Fetch path to check if slug is ready (Supabase trigger sets it when path_title is processed)
      const { data: path, error: pathError } = await supabase
        .from("upgrade_paths")
        .select("slug")
        .eq("id", waitingPathId)
        .maybeSingle()

      if (pathError) {
        console.error("❌ Error polling path:", pathError)
        if (pollCount >= maxPolls) {
          setError("Path generation timed out. Please try again.")
          setIsWaitingForPath(false)
        }
        return
      }

      if (!path) {
        if (pollCount >= maxPolls) {
          setError("Path not found. Please try again.")
          setIsWaitingForPath(false)
        }
        return // Continue polling if not at max
      }

      // Keep polling as long as slug is null (Supabase trigger hasn't finished yet)
      if (!path.slug) {
        // Continue polling - slug is null, waiting for Supabase trigger to complete
        if (pollCount >= maxPolls) {
          setError("Path generation timed out. Please try again.")
          setIsWaitingForPath(false)
        }
        return
      }
      
      // Green Light: Slug is non-null, meaning Supabase trigger has finished
      // Redirect immediately using router.replace()
      console.log(`✅ Path ready! Slug: "${path.slug}"`)
      
      // Fetch username for the route
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle()
      
      const userUsername = profile?.username || user.id
      setIsWaitingForPath(false)
      // Use replace to avoid adding to history stack
      router.replace(`/u/${userUsername}/${path.slug}`)
      return // Exit early - no need to continue polling
    }

    // Start polling immediately, then every 3 seconds
    checkPathReady()
    const interval = setInterval(checkPathReady, pollInterval)

    return () => {
      clearInterval(interval)
    }
  }, [isWaitingForPath, waitingPathId, router])

  const handleRoleSelect = (value: string) => {
    if (value === "custom") {
      setShowCustomRole(true)
      form.setValue("currentRole", "") // Clear it so they can type
    } else {
      setShowCustomRole(false)
      form.setValue("currentRole", value)
    }
  }

  const onSubmit = async (data: IntakeFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError("User not authenticated")
        setIsSubmitting(false)
        return
      }

      // If editing existing path, use update action
      if (isEditMode && pathId) {
        const result = await updatePathStrategy({
          pathId,
          ...data
        })
        
        if (!result.success) {
          setError(result.error || "Failed to update path strategy")
          setIsSubmitting(false)
        } else {
          onSuccess()
        }
      } else {
        // Create new path
        const result = await generatePath(data)
        if (!result.success) {
          setError(result.error || "Failed to generate upgrade path")
          setIsSubmitting(false)
        } else if (result.pathId) {
          // Enter waiting room - poll for final slug
          setIsSubmitting(false)
          setIsWaitingForPath(true)
          setWaitingPathId(result.pathId)
        } else {
          setError("Path creation failed - no path ID returned")
          setIsSubmitting(false)
        }
      }
    } catch (err) {
      console.error("Error submitting form:", err)
      setError("An unexpected error occurred. Please try again.")
      setIsSubmitting(false)
    }
  }

  // Show loading overlay when waiting for path to be ready
  if (isWaitingForPath) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <div className="flex gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:0ms]"></div>
          <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]"></div>
          <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]"></div>
        </div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Generating your upgrade path...
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          This usually takes 10-30 seconds
        </p>
      </div>
    )
  }

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        {/* 1. VISUAL ROLE SELECTOR */}
        <div className="space-y-3">
          <FormLabel>What best describes your role?</FormLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PREDEFINED_ROLES.map((role) => {
                  const Icon = role.icon
                  const isSelected = !showCustomRole && currentRoleValue === role.value
                  const isCustomSelected = showCustomRole && role.value === "custom"
                  const isActive = isSelected || isCustomSelected

                  return (
                    <div
                      key={role.id}
                      onClick={() => handleRoleSelect(role.value)}
                      className={cn(
                        "cursor-pointer relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800",
                        isActive 
                          ? "border-black bg-zinc-50 dark:border-white dark:bg-zinc-800" 
                          : "border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      )}
                    >
                      {isActive && (
                        <div className="absolute right-2 top-2 text-black dark:text-white">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      )}
                      <Icon className={cn("h-8 w-8", isActive ? "text-black dark:text-white" : "text-zinc-400")} />
                      <span className={cn("text-xs font-medium", isActive ? "text-black dark:text-white" : "text-zinc-500")}>
                        {role.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Custom Input appears only if "Other" is selected */}
              {showCustomRole && (
                <FormField
                  control={form.control}
                  name="currentRole"
                  render={({ field }) => (
                    <FormItem className="animate-in fade-in slide-in-from-top-2">
                      <FormControl>
                        <Input 
                          placeholder="e.g. Forensic Accountant" 
                          {...field} 
                          autoFocus 
                          disabled={isSubmitting} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            {/* Validation error if they try to submit without picking/typing anything */}
            {!showCustomRole && !currentRoleValue && form.formState.isSubmitted && (
              <p className="text-sm font-medium text-red-500">Please select a role</p>
            )}
          </div>

          {/* 2. CONTEXT FIELD */}
          <FormField
            control={form.control}
            name="bioContext"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resume or LinkedIn "About"</FormLabel>
                <FormDescription>
                  Paste your bio or resume to help AI understand your daily tasks.
                </FormDescription>
                <FormControl>
                  <Textarea 
                    placeholder="Paste text here..." 
                    className="min-h-[120px] font-mono text-sm"
                    {...field} 
                    disabled={isSubmitting} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 3. MAIN GOAL */}
          <FormField
            control={form.control}
            name="mainGoal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Main Goal (Next 6 months)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Automate reporting" {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ERROR MESSAGE */}
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              className="w-1/3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              onClick={() => {
                  form.reset({
                    currentRole: "",
                    bioContext: "",
                    mainGoal: "",
                  });
                  setShowCustomRole(false);
              }}
              disabled={isSubmitting}
            >
              Clear
            </Button>

            <Button 
              type="submit" 
              size="lg" 
              className="w-2/3" 
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? (isEditMode ? "Updating..." : "Analyzing...") 
                : (isEditMode ? "Update Strategy" : "Generate Path")}
            </Button>
          </div>
        </form>
      </Form>
    )

  if (!showCard) {
    return formContent
  }

  return (
    <Card className="w-full max-w-2xl border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-2xl font-light tracking-tight">
          Tell us about yourself
        </CardTitle>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Select your role or enter a custom one to get started.
        </p>
      </CardHeader>
      <CardContent>
        {formContent}
      </CardContent>
    </Card>
  )
}