"use client"

import Link from "next/link"
import ResourceIcon from "@/components/resource-icon"

interface TierSectionProps {
  title: string
  items: any[]
  isOwner: boolean
  username: string
  paths?: any[]
}

export default function TierSection({ title, items, isOwner, username, paths }: TierSectionProps) {
  // Helper function to get status info for tools
  const getStatusInfo = (status: string) => {
    if (status === 'added_paid') return { label: 'Paying For', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' }
    if (status === 'added_free') return { label: 'Free Trial', color: 'bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' }
    if (status === 'wishlisted') return { label: 'Wishlist', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800' }
    return null
  }

  if (items.length === 0) return null
  return (
    <div>
      {title && (
        <h3 className="text-base md:text-lg font-normal mb-4 text-zinc-800 flex items-center gap-2">
          {title} 
          <span className="text-sm md:text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-normal">
            {items.length}
          </span>
        </h3>
      )}
      <div className="grid gap-6 md:grid-cols-3">
        {items.map((item: any) => {
          const statusInfo = item.status ? getStatusInfo(item.status) : null
          
          return (
            <div key={item.resource.id} className="p-6 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all relative group">
              <div className="shrink-0 mt-1">
                <ResourceIcon 
                  url={item.resource.url}
                  logodev={item.resource.logodev}
                  name={item.resource.name}
                  className="w-16 h-16 rounded-md object-contain bg-white p-1"
                />
              </div>
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-base md:text-sm pr-6">{item.resource.name}</span>
              </div>
              <p className="text-sm md:text-xs text-zinc-500 mb-2">{item.resource.description}</p>
              
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {statusInfo && (
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                )}
                {(item.resource.paid_count && item.resource.paid_count > 0) ||
                 (item.resource.completion_count && item.resource.completion_count > 0) ||
                 (item.resource.enrollment_count && item.resource.enrollment_count > 0) ? (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                    Community Trust
                  </span>
                ) : null}
                {item.resource.url && (
                  <a 
                    href={item.resource.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm md:text-xs font-medium border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                  >
                    View Tool
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
