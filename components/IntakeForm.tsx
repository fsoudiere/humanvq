"use client"

import { useState } from "react"
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


interface IntakeFormData {
  currentRole: string
  mainGoal: string
  biggestPain: string
  dailyTools: string
  aiComfortLevel: number
  startupIdea?: string
}

interface IntakeFormProps {
  onSuccess: () => void;
}

export function IntakeForm({ onSuccess }: IntakeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<IntakeFormData>({
    defaultValues: {
      currentRole: "",
      mainGoal: "",
      biggestPain: "",
      dailyTools: "",
      aiComfortLevel: 5,
      startupIdea: "",
    },
  })

  const onSubmit = async (data: IntakeFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await generatePath(data)
      if (!result.success) {
        setError(result.error || "Failed to generate upgrade path")
        setIsSubmitting(false)
      } else {
        onSuccess()
      }
      // If successful, the page will update automatically via the polling mechanism
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
          Help us understand your unique profile to generate your personalized
          upgrade path.
        </p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="currentRole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Role</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Senior Product Manager"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mainGoal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Main Goal (Next 6-12 months)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your primary objective for the next 6-12 months..."
                      className="min-h-24"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="biggestPain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biggest Pain / Bottleneck</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What's the main challenge or bottleneck you face?"
                      className="min-h-24"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dailyTools"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Daily Tools Used</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="List the tools and software you use daily..."
                      className="min-h-24"
                      {...field}
                      disabled={isSubmitting}
                    />
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
                  <FormLabel>
                    AI Comfort Level: {field.value}/10
                  </FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={10}
                      step={1}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                      disabled={isSubmitting}
                      className="w-full"
                    />
                  </FormControl>
                  <FormDescription>
                    How comfortable are you with AI tools and technologies?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startupIdea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Startup Idea (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Share any startup or business ideas you're working on..."
                      className="min-h-24"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Generating Upgrade Path..." : "Generate Upgrade Path"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
