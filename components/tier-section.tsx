"use client"

import Link from "next/link"
import StackManager from "@/components/stack-manager"
import ResourceIcon from "@/components/resource-icon"

interface TierSectionProps {
  title: string
  items: any[]
  isOwner: boolean
  username: string
  paths?: any[]
}

export default function TierSection({ title, items, isOwner, username, paths }: TierSectionProps) {
  if (items.length === 0) return null
  return (
    <div className="p-6 bg-white border border-zinc-200 rounded-xl shadow-sm">
      <h3 className="text-lg font-bold mb-4 text-zinc-800 flex items-center gap-2">
        {title} 
        <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-normal">
          {items.length}
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item: any) => {
          const pathBadges = item.paths || []
          
          return (
            <div key={item.resource.id} className="p-4 border border-zinc-100 rounded-lg hover:bg-zinc-50 transition relative group">
              <div className="shrink-0 mt-1">
                <ResourceIcon 
                  url={item.resource.url}
                  logo_url={item.resource.logo_url}
                  name={item.resource.name}
                  className="w-16 h-16 rounded-md object-contain bg-white border border-zinc-100 p-1"
                />
              </div>
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-sm pr-6">{item.resource.name}</span>
                {isOwner && paths && paths.length > 0 && (
                  <div className="absolute top-4 right-4 scale-90 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <StackManager 
                      resourceId={item.resource.id} 
                      initialStatus={item.status} 
                      isCourse={false}
                      pathId={paths[0]?.id || null}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500 line-clamp-2 mb-2">{item.resource.description}</p>
              
              {/* Path Badges */}
              {pathBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pathBadges.map((path: any) => (
                    <Link
                      key={path.id}
                      href={`/u/${username}/${path.slug}`}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {path.title}
                    </Link>
                  ))}
                </div>
              )}
              
              {(
                 <a href={item.resource.url} target="_blank" className="text-[10px] text-blue-600 hover:underline block">
                   View Tool →
                 </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
