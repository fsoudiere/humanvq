"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Target, 
  Wrench, 
  GraduationCap, 
  Footprints, 
  UserPlus,
  Settings
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
  username: string
}

const navItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: (username: string) => `/u/${username}`,
  },
  {
    label: "Paths",
    icon: Target,
    href: (username: string) => `/u/${username}`,
  },
  {
    label: "Tools",
    icon: Wrench,
    href: (username: string) => `/u/${username}/tools`,
  },
  {
    label: "Skills",
    icon: GraduationCap,
    href: (username: string) => `/u/${username}/skills`,
  },
  {
    label: "Steps",
    icon: Footprints,
    href: (username: string) => `/u/${username}/steps`,
  },
  {
    label: "Invite Team",
    icon: UserPlus,
    href: (username: string) => `/u/${username}`, // TODO: Add invite team page
  },
  {
    label: "Settings",
    icon: Settings,
    href: () => "/settings",
  },
]

export default function Sidebar({ username }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="group/sidebar fixed left-0 top-[57px] bottom-0 w-16 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden hover:w-64 transition-all duration-200 z-40">
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const href = item.href(username)
          const isActive = pathname === href || 
            (item.label === "Dashboard" && pathname === `/u/${username}`) ||
            (item.label === "Paths" && pathname?.includes("/u/") && pathname !== `/u/${username}` && pathname !== `/u/${username}/create` && !pathname?.endsWith("/tools") && !pathname?.endsWith("/skills") && !pathname?.endsWith("/steps")) ||
            (item.label === "Tools" && pathname === `/u/${username}/tools`) ||
            (item.label === "Skills" && pathname === `/u/${username}/skills`) ||
            (item.label === "Steps" && pathname === `/u/${username}/steps`)

          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative",
                isActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              )}
              title={item.label}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 pointer-events-none">
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}