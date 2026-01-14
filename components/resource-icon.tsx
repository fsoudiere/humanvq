"use client"

import { useState } from "react"
import { getLogoUrl } from "@/lib/utils"

interface ResourceIconProps {
  url?: string
  name: string
  className?: string
}

export default function ResourceIcon({ url, name, className }: ResourceIconProps) {
  const [error, setError] = useState(false)
  
  const logoUrl = getLogoUrl(url)

  // If no URL or if image failed to load, don't render anything (or render a fallback)
  if (!logoUrl || error) return null

  return (
    <img
      src={logoUrl}
      alt={name}
      className={className}
      onError={() => setError(true)} // 👈 This works now because we are in a Client Component
    />
  )
}