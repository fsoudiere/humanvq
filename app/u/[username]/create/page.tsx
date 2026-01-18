"use client"

import { IntakeForm } from "@/components/IntakeForm"

export default function CreatePathPage() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-6 py-16">
        {/* IntakeForm Component */}
        <IntakeForm onSuccess={() => {}} />
      </main>
    </div>
  )
}
