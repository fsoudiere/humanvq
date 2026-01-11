"use client"

import { useState } from "react"
import {
  Bot,
  GraduationCap,
  Footprints,
  Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"

type AppState = "intake" | "loading" | "results"

export default function Home() {
  const [state, setState] = useState<AppState>("intake")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    type: "",
  })

  const handleConnect = () => {
    setState("loading")
    setTimeout(() => {
      setState("results")
    }, 2000)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission here
    console.log("Form submitted:", formData)
    setFormData({ name: "", url: "", type: "" })
    setDialogOpen(false)
  }

  const handleCheckIn = () => {
    // Simulate setting reminder
    alert("Check-in reminder set!")
  }

  if (state === "intake") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-20 text-center">
          <h1 className="text-5xl font-light leading-tight tracking-tight text-black dark:text-zinc-50">
            The world changed. Let's upgrade you to match it.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Discover your Human+ score and the AI tools that specifically
            support your unique profile.
          </p>
          <div className="flex flex-col items-center gap-4 pt-4">
            <Button
              onClick={handleConnect}
              size="lg"
              className="h-14 px-8 text-base font-medium"
            >
              Connect LinkedIn
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200">
                  Suggest an App/Course
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Suggest an App/Course</DialogTitle>
                  <DialogDescription>
                    Share a resource that could help professionals in the AI age.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Resource name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="url">URL</Label>
                    <Input
                      id="url"
                      type="url"
                      value={formData.url}
                      onChange={(e) =>
                        setFormData({ ...formData, url: e.target.value })
                      }
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Input
                      id="type"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      placeholder="App, Course, Tool, etc."
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Submit</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    )
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:0ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]"></div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]"></div>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Analyzing Human Moat...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* The Efficiency Audit */}
        <section className="mb-20">
          <h2 className="mb-8 text-3xl font-light tracking-tight text-black dark:text-zinc-50">
            The Efficiency Audit
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Delegate to Machine */}
            <Card className="border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-red-900 dark:text-red-400">
                  Delegate to Machine
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-zinc-700 dark:text-zinc-300">
                  <li className="flex items-center gap-2">
                    <span className="text-red-600 dark:text-red-400">•</span>
                    Logistics Forecasting
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-red-600 dark:text-red-400">•</span>
                    Data Orchestration
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-red-600 dark:text-red-400">•</span>
                    Content Drafting
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Right: Keep for Human */}
            <Card className="border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-green-900 dark:text-green-400">
                  Keep for Human
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 font-medium text-zinc-900 dark:text-zinc-100">
                  <li className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">•</span>
                    Cultural Governance
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">•</span>
                    Crisis Intuition
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">•</span>
                    Strategic Purpose
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* The Power Pack */}
        <section className="mb-20">
          <h2 className="mb-8 text-3xl font-light tracking-tight text-black dark:text-zinc-50">
            The Power Pack
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* The Tool */}
            <Card>
              <CardHeader>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <Bot className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <Badge variant="secondary">The Tool</Badge>
                </div>
                <CardTitle className="text-xl">n8n</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Agentic Workflows
                </p>
              </CardContent>
            </Card>

            {/* The Course */}
            <Card>
              <CardHeader>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <GraduationCap className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <Badge variant="secondary">The Course</Badge>
                </div>
                <CardTitle className="text-xl">MIT xPRO</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-600 dark:text-zinc-400">
                  AI for Senior Execs
                </p>
              </CardContent>
            </Card>

            {/* First Step */}
            <Card>
              <CardHeader>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <Footprints className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <Badge variant="secondary">First Step</Badge>
                </div>
                <CardTitle className="text-xl">30-Day Audit</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Assess team 'AI-Vibe'
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Accountability Bridge */}
        <section>
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-2xl font-light tracking-tight">
                Accountability Bridge
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="text-zinc-600 dark:text-zinc-400">
                Set a check-in reminder to track your progress on your Human+
                journey.
              </p>
              <Button onClick={handleCheckIn} size="lg" className="gap-2">
                <Calendar className="h-4 w-4" />
                Check-in
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
