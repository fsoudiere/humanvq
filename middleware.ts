import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create Supabase client for middleware (can read and write cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // CRITICAL: Call getUser() to refresh the session and update cookies
  // This ensures the refresh token is available for new users
  // and prevents "Refresh Token Not Found" errors
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // If there's an error getting the user, the session might be invalid
  // but we still return the response to let the app handle it
  if (error) {
    console.log("⚠️ Middleware: Auth error (user may not be logged in):", error.message)
  }

  // The getUser() call above automatically:
  // 1. Refreshes the access token if expired
  // 2. Updates the refresh token if needed
  // 3. Sets all necessary cookies via setAll() above
  // This ensures server actions have valid tokens

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (public assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
