import { ImageResponse } from 'next/og'
import { createClient } from '@/utils/supabase/server'

// Image metadata
export const alt = 'AI Stack Overview'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Optional: Use Edge Runtime for faster generation
export const runtime = 'edge'

export default async function Image({ params }: { params: Promise<{ userId: string }> }) {
  // 1. Await params and fetch user data
  const { userId } = await params
  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_role")
    .eq("user_id", userId)
    .single()

  // Format the role name (e.g., "founder" -> "Founder")
  const roleRaw = profile?.current_role || "Founder"
  const role = roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1)
  const title = `${role}'s AI Stack`

  // 2. Draw the image using JSX
  return new ImageResponse(
    (
      // Outer Container (Background with subtle pattern)
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fafafa', // Zinc-50
          // Subtle dot pattern background
          backgroundImage: 'radial-gradient(circle at 25px 25px, #e4e4e7 2%, transparent 0%), radial-gradient(circle at 75px 75px, #e4e4e7 2%, transparent 0%)',
          backgroundSize: '100px 100px',
        }}
      >
        {/* Inner Card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'white',
            border: '2px solid #f4f4f5', // Zinc-100
            borderRadius: '32px',
            padding: '80px 100px',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08)',
            textAlign: 'center',
          }}
        >
           {/* Icon (You can replace with a logo image if you have one) */}
           <div style={{ fontSize: 70, marginBottom: 30 }}>🚀</div>

          {/* Main Title (Dynamic) */}
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: '#18181b', // Zinc-900
              marginBottom: 20,
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}
          >
            {title}
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 36,
              color: '#52525b', // Zinc-600
              fontWeight: 500,
            }}
          >
            Human VQ Profile & Tool Arsenal
          </div>
        </div>

        {/* Footer Branding */}
        <div
          style={{
            position: 'absolute',
            bottom: 50,
            fontSize: 24,
            color: '#a1a1aa', // Zinc-400
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          AI Stack Builder
        </div>
      </div>
    ),
    // Image Response Options
    {
      ...size,
    }
  )
}