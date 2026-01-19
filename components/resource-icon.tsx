"use client"

import { useState } from "react"
import { getLogoUrl } from "@/lib/utils"

interface ResourceIconProps {
  url?: string
  name: string
  logodev?: string // Domain name for Logo.dev API
  className?: string
}

export default function ResourceIcon({ url, name, logodev, className }: ResourceIconProps) {
  const [logoDevError, setLogoDevError] = useState(false)
  const [googleFaviconError, setGoogleFaviconError] = useState(false)
  
  // 1. Priority 1: Use Logo.dev API if logodev is available
  if (logodev && !logoDevError) {
    const logoDevUrl = `https://img.logo.dev/${logodev}?token=${process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN}&size=128`
    return (
      <img
        src={logoDevUrl}
        alt={name}
        className={className}
        onError={() => {
          console.error(`Failed to load Logo.dev logo for ${name}: ${logodev}`)
          setLogoDevError(true)
        }}
      />
    )
  }

  // 2. Priority 2: Fallback to Google Favicon API
  const googleFaviconUrl = logodev 
    ? `https://www.google.com/s2/favicons?domain=${logodev}&sz=32`
    : (url ? getLogoUrl(url) : null)

  if (googleFaviconUrl && !googleFaviconError) {
    return (
      <img
        src={googleFaviconUrl}
        alt={name}
        className={className}
        onError={() => {
          console.error(`Failed to load Google Favicon for ${name}`)
          setGoogleFaviconError(true)
        }}
      />
    )
  }

  // 3. Final Fallback: A simple letter avatar
  return (
    <div className={`${className} bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-400`}>
      {name[0].toUpperCase()}
    </div>
  )
}