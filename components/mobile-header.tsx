"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
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
    LogOut,
    Share2,
    Pencil,
    Trash2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { ShareButton } from "./share-button"
import { DeletePathButton } from "./delete-path-button"

interface MobileHeaderProps {
    username: string
    createPathLink: string
    breadcrumbName: string
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
        href: (username: string) => `/u/${username}`,
    },
    {
        label: "Settings",
        icon: Settings,
        href: () => "/settings",
    },
]

// Function to get page title based on pathname
function getPageTitle(pathname: string, username: string): string {
    if (!pathname) return "Dashboard"
    
    // Dashboard page
    if (pathname === `/u/${username}`) {
        return "Dashboard"
    }
    
    // Tools page
    if (pathname === `/u/${username}/tools`) {
        return "Tools"
    }
    
    // Skills page
    if (pathname === `/u/${username}/skills`) {
        return "Skills"
    }
    
    // Steps page
    if (pathname === `/u/${username}/steps`) {
        return "Steps"
    }
    
    // Settings page
    if (pathname === "/settings") {
        return "Settings"
    }
    
    // Create path page
    if (pathname === `/u/${username}/create`) {
        return "Create Path"
    }
    
    // Individual path pages (has slug after username)
    if (pathname?.startsWith(`/u/${username}/`) && pathname !== `/u/${username}/create` && !pathname?.endsWith("/tools") && !pathname?.endsWith("/skills") && !pathname?.endsWith("/steps")) {
        return "Path"
    }
    
    return "Dashboard"
}

export default function MobileHeader({ 
    username, 
    createPathLink, 
    breadcrumbName
}: MobileHeaderProps) {
    const pathname = usePathname()
    const router = useRouter()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [pathData, setPathData] = useState<{
        pathId: string
        pathTitle: string
        userName: string
        isPublic: boolean
        isOwner: boolean
    } | null>(null)

    // Close mobile menu when pathname changes
    useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [pathname])

    // Detect if we're on a path page and fetch data
    useEffect(() => {
        const checkPathPage = async () => {
            if (!pathname) return
            
            // Check if we're on a path page (has slug after username, not tools/skills/steps/create)
            const pathMatch = pathname.match(/^\/u\/([^/]+)\/([^/]+)$/)
            if (pathMatch && pathMatch[2] !== 'tools' && pathMatch[2] !== 'skills' && pathMatch[2] !== 'steps' && pathMatch[2] !== 'create') {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                
                if (user) {
                    // Fetch path data
                    const { data: path } = await supabase
                        .from("upgrade_paths")
                        .select("id, path_title, is_public, user_id")
                        .eq("slug", pathMatch[2])
                        .maybeSingle()
                    
                    if (path) {
                        const isOwner = path.user_id === user.id
                        
                        // Get user name
                        const { data: profile } = await supabase
                            .from("profiles")
                            .select("full_name")
                            .eq("user_id", user.id)
                            .maybeSingle()
                        
                        setPathData({
                            pathId: path.id,
                            pathTitle: path.path_title,
                            userName: profile?.full_name || "",
                            isPublic: path.is_public || false,
                            isOwner
                        })
                    }
                }
            } else {
                setPathData(null)
            }
        }
        
        checkPathPage()
    }, [pathname])

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push("/")
        router.refresh()
    }

    const handleEdit = () => {
        // Trigger edit dialog by dispatching a custom event
        // The path page will listen for this event
        window.dispatchEvent(new CustomEvent('openEditDialog'))
    }

    const isDashboard = pathname === `/u/${username}`
    const isPathPage = pathData !== null
    // Use actual path title if available, otherwise fall back to generic title
    const pageTitle = isPathPage && pathData?.pathTitle 
      ? pathData.pathTitle 
      : getPageTitle(pathname || "", username)

    return (
        <header className="md:hidden sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                {/* Left: Menu Icon + Title (both open the drawer) */}
                <div className="flex items-center">
                    <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-3 gap-2"
                            >
                                {isMobileMenuOpen ? (
                                    <X className="h-5 w-5" />
                                ) : (
                                    <Menu className="h-5 w-5" />
                                )}
                                <span className="text-base md:text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate max-w-[200px]">{pageTitle}</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-64 p-0">
                            <div className="border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 h-full">
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
                                                onClick={() => setIsMobileMenuOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 px-3 py-2 rounded-md text-base md:text-sm font-medium transition-colors relative",
                                                    isActive
                                                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                                                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                                                )}
                                            >
                                                <Icon className="h-5 w-5 shrink-0" />
                                                <span className="whitespace-nowrap">{item.label}</span>
                                            </Link>
                                        )
                                    })}
                                    
                                    {/* Logout button */}
                                    <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800">
                                        <button
                                            onClick={() => {
                                                handleLogout()
                                                setIsMobileMenuOpen(false)
                                            }}
                                            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-base md:text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 transition-colors"
                                        >
                                            <LogOut className="h-5 w-5 shrink-0" />
                                            <span className="whitespace-nowrap">Logout</span>
                                        </button>
                                    </div>
                                </nav>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>

                {/* Right: Action Icons */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {isDashboard && (
                        <>
                            {/* Share button for dashboard */}
                            <ShareButton
                                targetType="stack"
                                targetId={username}
                                isOwner={true}
                                userName={breadcrumbName}
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                            />
                            {/* + New Path button */}
                            <Link href={createPathLink}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 w-9 p-0"
                                >
                                    <div className="h-5 w-5 rounded-full bg-black dark:bg-black flex items-center justify-center">
                                        <Plus className="h-4 w-4 text-white" />
                                    </div>
                                </Button>
                            </Link>
                        </>
                    )}
                    
                    {isPathPage && pathData && pathData.isOwner && (
                        <>
                            {/* Share button */}
                            <ShareButton
                                targetType="path"
                                targetId={pathData.pathId}
                                isOwner={pathData.isOwner}
                                initialVisibility={pathData.isPublic}
                                pathTitle={pathData.pathTitle}
                                userName={pathData.userName}
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                            />
                            {/* Edit button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleEdit}
                                className="h-9 w-9 p-0 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                            {/* Delete button */}
                            <DeletePathButton pathId={pathData.pathId} />
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}
