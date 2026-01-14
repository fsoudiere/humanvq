import Link from "next/link"
import { createClient } from "@/utils/supabase/server"
import { Button } from "@/components/ui/button"
import { LogOut, Home } from "lucide-react"
import LogoutButton from "./logout-button"

export default async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo / Home Link */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-light tracking-tight text-black dark:text-zinc-50">
            HumanVQ
          </span>
        </Link>
        
        {/* Navigation */}
        <nav className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  <Home className="h-4 w-4" />
                  Home
                </Button>
              </Link>
              <Link href={`/stack/${user.id}`}>
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  My Stack 📚
                </Button>
              </Link>
              <LogoutButton />
            </>
          ) : (
            <Link href="/">
              <Button size="sm" variant="outline">
                Get Started
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}