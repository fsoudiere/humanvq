"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PathGenerationModal } from "@/components/path-generation-modal"
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

// 🎯 PRE-DEFINED FOCUS AREAS CONFIGURATION
const PREDEFINED_ROLES = [
  // Business Units
  { id: "marketing-team", label: "Marketing Team", icon: Megaphone, value: "Marketing Team", category: "Business Units" },
  { id: "design-team", label: "Design Team", icon: Code2, value: "Design Team", category: "Business Units" },
  { id: "sales-dept", label: "Sales Dept", icon: LineChart, value: "Sales Dept", category: "Business Units" },
  { id: "product-org", label: "Product Org", icon: Briefcase, value: "Product Org", category: "Business Units" },
  // Entrepreneurial Focus
  { id: "growth-user-acq", label: "Growth & User Acq", icon: Rocket, value: "Growth & User Acq", category: "Entrepreneurial Focus" },
  { id: "operations", label: "Operations", icon: LineChart, value: "Operations", category: "Entrepreneurial Focus" },
  // Individual Projects
  { id: "side-project", label: "Side Project", icon: Code2, value: "Side Project", category: "Individual Projects" },
  { id: "other", label: "Custom Focus", icon: MoreHorizontal, value: "custom", category: "Custom" },
]

export function IntakeForm({ onSuccess, pathId, initialData, showCard = true }: IntakeFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWaitingForPath, setIsWaitingForPath] = useState(false)
  const [waitingPathId, setWaitingPathId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCustomRole, setShowCustomRole] = useState(false)
  const [generationStep, setGenerationStep] = useState(1)
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

  // Animate generation steps
  useEffect(() => {
    if (!isWaitingForPath) {
      setGenerationStep(1)
      return
    }

    // Cycle through steps with delays
    const stepDelays = [1000, 3000, 5000, 7000] // Show each step for progressively longer
    
    let currentStep = 1
    const stepInterval = setInterval(() => {
      currentStep++
      if (currentStep <= 4) {
        setGenerationStep(currentStep)
      }
    }, 2000) // Change step every 2 seconds

    return () => clearInterval(stepInterval)
  }, [isWaitingForPath])

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
        // Update to final step while waiting
        setGenerationStep(4)
        // Continue polling - slug is null, waiting for Supabase trigger to complete
        if (pollCount >= maxPolls) {
          setError("Path generation timed out. Please try again.")
          setIsWaitingForPath(false)
        }
        return
      }
      
      // Green Light: Slug is non-null, meaning Supabase trigger has finished
      // Show completion step briefly before redirect
      setGenerationStep(4)
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


  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        {/* 1. VISUAL FOCUS AREA SELECTOR */}
        <div className="space-y-2">
          <FormLabel>This path is for?</FormLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                        "cursor-pointer relative flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-2.5 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800",
                        isActive 
                          ? "border-black bg-zinc-50 dark:border-white dark:bg-zinc-800" 
                          : "border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      )}
                    >
                      {isActive && (
                        <div className="absolute right-1.5 top-1.5 text-black dark:text-white">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </div>
                      )}
                      <Icon className={cn("h-6 w-6", isActive ? "text-black dark:text-white" : "text-zinc-400")} />
                      <span className={cn("text-[11px] font-medium", isActive ? "text-black dark:text-white" : "text-zinc-500")}>
                        {role.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Custom Input appears only if "Custom Focus" is selected */}
              {showCustomRole && (
                <FormField
                  control={form.control}
                  name="currentRole"
                  render={({ field }) => (
                    <FormItem className="animate-in fade-in slide-in-from-top-2">
                      <FormControl>
                        <Input 
                          placeholder="Enter a specific team or activity name" 
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
              <p className="text-sm font-medium text-red-500">Please select a focus area</p>
            )}
          </div>

          {/* 2. OPERATIONAL CONTEXT FIELD */}
          <FormField
            control={form.control}
            name="bioContext"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Context</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="e.g., 'Our Design team manually crops 50 images a day...' or 'I spend 4 hours a week researching competitors...'" 
                    className="min-h-[120px]"
                    {...field} 
                    disabled={isSubmitting} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 3. LEVERAGE OBJECTIVE */}
          <FormField
            control={form.control}
            name="mainGoal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Short Term Goal</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 'Automate SEO report generation' or 'Scale content production without increasing headcount.'" {...field} disabled={isSubmitting} />
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

          {/* THE CALCULATION */}
          <div className="space-y-3 pt-2">
            <Button 
              type="submit" 
              size="lg" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? (isEditMode ? "Updating..." : "Analyzing...") 
                : (isEditMode ? "Update Strategy" : "Analyze & Generate Path")}
            </Button>
            <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
              This will identify specific AI Tools, Human Skills, and Steps to protect and scale this focus area.
            </p>
          </div>
        </form>
      </Form>
    )

  if (!showCard) {
    return (
      <>
        <PathGenerationModal isOpen={isWaitingForPath} currentStep={generationStep} />
        {formContent}
      </>
    )
  }

  return (
    <>
      <PathGenerationModal isOpen={isWaitingForPath} currentStep={generationStep} />
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-normal text-zinc-900 dark:text-zinc-50">
          Initiate a Strategy Path
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
          Define the Focus Area for this path to calculate its specific HVQ Score and roadmap.
        </p>
      </div>

      <Card className="w-full max-w-2xl border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <CardContent>
          {formContent}
        </CardContent>
      </Card>
    </>
  )
}