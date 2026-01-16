"use client"

import Link from "next/link"
import StackManager from "@/components/stack-manager"
import ResourceIcon from "@/components/resource-icon"

interface CourseGroupProps {
  title: string
  items: any[]
  isOwner: boolean
  username: string
  icon: React.ReactNode
  colorClass: string
  paths?: any[]
}

export default function CourseGroup({ title, items, isOwner, username, icon, colorClass, paths }: CourseGroupProps) {
  return (
    <div className={`p-6 rounded-xl border ${colorClass}`}>
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-zinc-800">
        {icon} {title}
        <span className="text-xs bg-white border border-zinc-200 px-2 py-0.5 rounded-full text-zinc-500 font-normal ml-auto">
          {items.length} Items
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item: any) => {
          const pathBadges = item.paths || []
          
          return (
            <div key={item.resource.id} className="bg-white p-4 rounded-lg border border-zinc-200/60 shadow-sm flex flex-col h-full">
              <div className="shrink-0">
                 <ResourceIcon 
                   url={item.resource.url}
                   logo_url={item.resource.logo_url}
                   name={item.resource.name}
                   className="w-16 h-16 rounded object-contain"
                 />
                </div>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  
                  <span className="font-bold text-sm text-zinc-900">{item.resource.name}</span>
                </div>
                
                {/* 👇 This is the magic prop: isCourse={true} */}
                {isOwner && paths && paths.length > 0 && (
                  <div className="scale-90 origin-top-right">
                    {/* Use most recent path for profile page updates */}
                    <StackManager 
                      resourceId={item.resource.id} 
                      initialStatus={item.status} 
                      isCourse={true}
                      pathId={paths[0]?.id || null}
                    />
                  </div>
                )}
              </div>
              
              <p className="text-xs text-zinc-500 mb-3 line-clamp-2">
                {item.resource.description}
              </p>
              
              {/* Path Badges */}
              {pathBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {pathBadges.map((path: any) => (
                    <Link
                      key={path.id}
                      href={`/u/${username}/${path.slug}`}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {path.title}
                    </Link>
                  ))}
                </div>
              )}
              
              {!isOwner && (
                <div className="mt-auto pt-2 border-t border-zinc-50">
                  <a href={item.resource.url} target="_blank" className="text-xs font-semibold text-blue-600 hover:underline">
                    Start Learning →
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
