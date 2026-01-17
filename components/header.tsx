import Link from "next/link"
import { createClient } from "@/utils/supabase/server"
import { Button } from "@/components/ui/button"
import { LogOut, Home, Settings, Plus } from "lucide-react"
import LogoutButton from "./logout-button"
import { getUserDestination } from "@/actions/profiles"

export default async function Header() {
  const supabase = await createClient()
  
  // STEP 1: Auth First - Always get user from auth first
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  // If no user, don't try to fetch profile
  if (!user || authError) {
    return (
      <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-light tracking-tight text-black dark:text-zinc-50">
              HumanVQ
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/">
              <Button size="sm" variant="outline">Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>
    )
  }
  
  // STEP 2: Profile Second - Fetch profile using user.id from auth
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_organization, organization_name, username")
    .eq("user_id", user.id)
    .maybeSingle()
  
  // STEP 3: Fail-Safe - If profile is null but user exists, use user metadata
  const displayName = profile?.organization_name || 
                     user.user_metadata?.full_name || 
                     user.user_metadata?.name ||
                     user.email?.split('@')[0] || // Use email prefix as last resort
                     "User"
  
  const isOrganization = profile?.is_organization || false
  
  // Determine stack label: if organization, show "{org_name}'s Stack", otherwise "My Stack"
  const stackLabel = isOrganization && profile?.organization_name
    ? `${profile.organization_name}'s Stack`
    : isOrganization && !profile?.organization_name
    ? "Company Stack"
    : "My Stack"
  
  // Use username for link if available, otherwise fall back to user_id (UUID)
  const profileLink = profile?.username ? `/u/${profile.username}` : `/u/${user.id}`
  
  // Create link for new stack/path
  const createPathLink = profile?.username ? `/u/${profile.username}/create` : `/u/${user.id}/create`
  
  // Get home destination using the helper function
  const homeDestination = await getUserDestination(user.id)
  
  console.log("🔍 Header - Auth & Profile:", {
    userId: user.id,
    userEmail: user.email,
    userMetadata: user.user_metadata,
    profile: profile,
    displayName: displayName,
    isOrganization: isOrganization,
    stackLabel: stackLabel,
    homeDestination: homeDestination
  })

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo / Home Link */}
        <Link href={homeDestination || "/"} className="flex items-center gap-2">
          <span className="text-xl font-light tracking-tight text-black dark:text-zinc-50">
            HumanVQ
          </span>
        </Link>
        
        {/* Navigation */}
        <nav className="flex items-center gap-4">
          {user ? (
            <>
              <Link href={homeDestination || "/"}>
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  <Home className="h-4 w-4" />
                  Home
                </Button>
              </Link>
              <Link href={profileLink}>
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  {stackLabel} 📚
                </Button>
              </Link>
              <Link href={createPathLink}>
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  <Plus className="h-4 w-4" />
                  New Stack
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  <Settings className="h-4 w-4" />
                  Settings
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