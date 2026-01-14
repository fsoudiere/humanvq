"use client"

import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <LogOut className="h-4 w-4" />
      Logout
    </Button>
  )
}
