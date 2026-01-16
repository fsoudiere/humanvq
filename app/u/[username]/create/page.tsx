"use client"

import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { IntakeForm } from "@/components/IntakeForm"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function CreatePathPage() {
  const params = useParams()
  const username = params.username as string

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-2xl px-6 py-16">
        {/* Back Button */}
        <div className="mb-8">
          <Link href={`/u/${username}`}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Portfolio
            </Button>
          </Link>
        </div>

        {/* IntakeForm Component */}
        <IntakeForm onSuccess={() => {}} />
      </main>
    </div>
  )
}
