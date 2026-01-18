import Link from "next/link"
import { createClient } from "@/utils/supabase/server"
import { Button } from "@/components/ui/button"
import { Settings, Plus, Search, ChevronRight } from "lucide-react"
import LogoutButton from "./logout-button"
import { getUserDestination } from "@/actions/profiles"
import PathSelector from "./path-selector"
import { Input } from "@/components/ui/input"

export default async function Header() {
  const supabase = await createClient()
  
  // STEP 1: Auth First - Always get user from auth first
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  // If no user, don't try to fetch profile
  if (!user || authError) {
    return (
      <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-full items-center justify-between px-4 py-3">
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
    .select("is_organization, organization_name, full_name, username")
    .eq("user_id", user.id)
    .maybeSingle()
  
  // STEP 3: Determine display name for breadcrumb
  // Priority: organization_name > full_name > username > email prefix
  const breadcrumbName = profile?.is_organization && profile?.organization_name
    ? profile.organization_name
    : profile?.full_name || 
      profile?.username ||
      user.user_metadata?.full_name || 
      user.user_metadata?.name ||
      user.email?.split('@')[0] || 
      "User"
  
  // Use username for link if available, otherwise fall back to user_id (UUID)
  const profileLink = profile?.username ? `/u/${profile.username}` : `/u/${user.id}`
  
  // Create link for new stack/path
  const createPathLink = profile?.username ? `/u/${profile.username}/create` : `/u/${user.id}/create`
  
  // Get home destination using the helper function
  const homeDestination = await getUserDestination(user.id)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mx-auto flex max-w-full items-center justify-between px-4 py-3 gap-4">
        {/* Left: Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 min-w-0 flex-1">
          <Link href={homeDestination || "/"} className="font-medium text-black dark:text-zinc-50 hover:underline shrink-0">
            HumanVQ
          </Link>
          {profile && (
            <>
              <ChevronRight className="h-4 w-4 shrink-0" />
              <Link href={profileLink} className="truncate hover:underline shrink-0">
                {breadcrumbName}
              </Link>
              {profile.username && (
                <>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                  <PathSelector username={profile.username} />
                </>
              )}
            </>
          )}
        </div>
        
        {/* Right: Search, New, Settings, Logout */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Search/Chat Input */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="search"
              placeholder="Search or chat..."
              className="pl-9 w-[200px] h-9 text-sm"
              disabled
            />
          </div>
          
          {/* New Path Button */}
          <Link href={createPathLink}>
            <Button 
              size="sm" 
              className="rounded-full gap-1.5 bg-black hover:bg-gray-800 dark:bg-black dark:hover:bg-gray-800 text-white"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </Link>
          
          {/* Settings Icon */}
          <Link href="/settings">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 w-9 p-0 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          
          {/* Logout Icon */}
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}