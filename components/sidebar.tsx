"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    Target,
    Bot,
    GraduationCap,
    Footprints,
    UserPlus,
    Settings,
    Menu,
    X,
    Plus,
    LogOut
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"

interface SidebarProps {
    username: string
    createPathLink?: string
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
        icon: Bot,
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

export default function Sidebar({ username, createPathLink }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    // Close mobile menu when pathname changes
    useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [pathname])

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push("/")
        router.refresh()
    }

    const NavContent = ({ showLabels = false, isMobile = false }: { showLabels?: boolean; isMobile?: boolean }) => {
        return (
            <nav className="p-3 space-y-1">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const href = item.href(username)
                    const isActive = pathname === href ||
                        (item.label === "Dashboard" && pathname === `/u/${username}`) ||
                        (item.label === "Paths" && pathname?.includes("/u/") && pathname !== `/u/${username}` && pathname !== `/u/${username}/create` && !pathname?.endsWith("/tools") && !pathname?.endsWith("/skills") && !pathname?.endsWith("/steps")) ||
                        (item.label === "Tools" && pathname === `/u/${username}/tools`) ||
                        (item.label === "Skills" && pathname === `/u/${username}/skills`) ||
                        (item.label === "Steps" && pathname === `/u/${username}/steps`)

                    // Special handling for Dashboard in mobile drawer - add + button
                    if (isMobile && item.label === "Dashboard") {
                        return (
                            <div key={item.label} className="flex items-center justify-between gap-2 px-3 py-2">
                                <Link
                                    href={href}
                                    className={cn(
                                        "flex items-center gap-3 flex-1 rounded-md text-sm font-medium transition-colors relative",
                                        isActive
                                            ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                                    )}
                                >
                                    <Icon className="h-5 w-5 shrink-0" />
                                    <span className="whitespace-nowrap">{item.label}</span>
                                </Link>
                                {createPathLink && (
                                    <Link href={createPathLink}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        )
                    }

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
                            <span className={cn(
                                "whitespace-nowrap transition-opacity duration-200",
                                showLabels 
                                    ? "opacity-100" 
                                    : "opacity-0 group-hover/sidebar:opacity-100 pointer-events-none"
                            )}>
                                {item.label}
                            </span>
                        </Link>
                    )
                })}
                
                {/* Logout button in mobile drawer */}
                {isMobile && (
                    <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 transition-colors"
                        >
                            <LogOut className="h-5 w-5 shrink-0" />
                            <span className="whitespace-nowrap">Logout</span>
                        </button>
                    </div>
                )}
            </nav>
        )
    }

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden md:block group/sidebar fixed left-0 top-[57px] bottom-0 w-16 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden hover:w-64 transition-all duration-200 z-40">
                <NavContent />
            </aside>

            {/* Mobile Menu - Now handled by Header */}
        </>
    )
}