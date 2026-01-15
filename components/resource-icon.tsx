"use client"

import { useState } from "react"
import { getLogoUrl } from "@/lib/utils"

interface ResourceIconProps {
  url?: string
  name: string
  logo_url?: string // 👈 New prop for your internal Supabase image
  className?: string
}

export default function ResourceIcon({ url, name, logo_url, className }: ResourceIconProps) {
  const [error, setError] = useState(false)
  console.log(`Resource: ${name} | logo_url:`, logo_url);
  // 1. Priority 1: Use your internal Supabase logo if it exists
  // This is safe for image exports (no CORS issues)
  if (logo_url && !error) {
    return (
      <img
        src={logo_url}
        alt={name}
        className={className}
        //onError={() => setError(true)}
        onError={() => {
            console.error(`Failed to load logo for ${name}: ${logo_url}`);
            setError(true);
          }}
      />
    )
  }

  // 2. Priority 2: Fallback to Google Favicon API
  // Note: This may still trigger CORS errors during JPG generation
  const fallbackLogo = url ? getLogoUrl(url) : null

  if (!fallbackLogo || error) {
    // 3. Final Fallback: A simple letter avatar
    return (
      <div className={`${className} bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-400`}>
        {name[0].toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={fallbackLogo}
      alt={name}
      className={className}
      onError={() => setError(true)}
    />
  )
}