"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import Sidebar from "./sidebar"

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [username, setUsername] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Fetch profile to get username
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("user_id", user.id)
          .maybeSingle()
        
        if (profile?.username) {
          setUsername(profile.username)
        } else {
          // Fallback to user ID if no username
          setUsername(user.id)
        }
      }
      setIsLoading(false)
    }

    checkAuth()
  }, [pathname])

  // Show sidebar only if user is logged in and on user pages or settings (not home/auth pages)
  const shouldShowSidebar = username && (pathname?.startsWith("/u/") || pathname === "/settings")

  if (isLoading) {
    return <>{children}</>
  }

  return (
    <>
      {shouldShowSidebar && <Sidebar username={username} />}
      <div className={shouldShowSidebar ? "ml-16 transition-all duration-200" : ""}>
        {children}
      </div>
    </>
  )
}