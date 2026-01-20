"use client"

import { IntakeForm } from "@/components/IntakeForm"

export default function CreatePathPage() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-full px-6 pt-8 pb-16">
        {/* IntakeForm Component */}
        <IntakeForm onSuccess={() => {}} showCard={false} />
      </main>
    </div>
  )
}
