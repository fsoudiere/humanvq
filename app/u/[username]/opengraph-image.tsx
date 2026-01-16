import { ImageResponse } from "next/og"
import { createClient } from "@/utils/supabase/server"

export const runtime = "edge"
export const alt = "HumanVQ Stack"
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const supabase = await createClient()

  // Fetch profile by username
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_organization, organization_name")
    .eq("username", username)
    .maybeSingle()

  // Determine display name
  const displayName = profile?.is_organization && profile?.organization_name
    ? profile.organization_name
    : profile?.full_name || username

  const stackLabel = profile?.is_organization
    ? "Company Stack"
    : "AI Stack"

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 60,
          background: "white",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: "bold",
              color: "#18181b",
            }}
          >
            {displayName}'s {stackLabel}
          </div>
          <div
            style={{
              fontSize: 36,
              color: "#71717a",
            }}
          >
            Curated AI tools and learning resources
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
