"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
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
import { Slider } from "@/components/ui/slider"
import { generatePath } from "@/actions/generate-path"
import { createClient } from "@/utils/supabase/client"
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
  dailyTools: string
  aiComfortLevel: number
  startupIdea?: string
}

interface IntakeFormProps {
  onSuccess: () => void;
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

export function IntakeForm({ onSuccess }: IntakeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCustomRole, setShowCustomRole] = useState(false)

  const form = useForm<IntakeFormData>({
    defaultValues: {
      currentRole: "",
      bioContext: "",
      mainGoal: "",
      dailyTools: "",
      aiComfortLevel: 5,
      startupIdea: "",
    },
  })

  // Watch the current role to update UI selection state
  const currentRoleValue = form.watch("currentRole")

  // Auto-fill from LinkedIn (Only if user hasn't selected anything yet)
  useEffect(() => {
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
  }, [form])

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
      const result = await generatePath(data)
      if (!result.success) {
        setError(result.error || "Failed to generate upgrade path")
        setIsSubmitting(false)
      } else {
        onSuccess();
      }
    } catch (err) {
      console.error("Error submitting form:", err)
      setError("An unexpected error occurred. Please try again.")
      setIsSubmitting(false)
    }
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

            {/* 4. SPLIT ROW: TOOLS & COMFORT */}
            <div className="grid gap-6 md:grid-cols-2">
                <FormField
                control={form.control}
                name="dailyTools"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Daily Tools</FormLabel>
                    <FormControl>
                        <Input placeholder="Excel, Jira..." {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />

                <FormField
                control={form.control}
                name="aiComfortLevel"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>AI Comfort: {field.value}/10</FormLabel>
                    <FormControl>
                        <Slider
                        min={0} max={10} step={1}
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        disabled={isSubmitting}
                        className="pt-2"
                        />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>

            {/* 5. STARTUP IDEA */}
            <FormField
              control={form.control}
              name="startupIdea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Startup Idea (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any business ideas?" 
                      className="min-h-[80px]"
                      {...field} 
                      disabled={isSubmitting} 
                    />
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
                    form.reset();
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
                {isSubmitting ? "Analyzing..." : "Generate Path"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}