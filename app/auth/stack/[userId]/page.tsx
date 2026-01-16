import { createClient } from "@/utils/supabase/server"
import StackManager from "@/components/stack-manager"
import Link from "next/link"

export default async function PublicStackPage({ params }: { params: { userId: string } }) {
  const supabase = await createClient()
  
  // Fetch path_resources directly (single source of truth)
  const { data: allPathResources, error: pathResourcesError } = await supabase
    .from("path_resources")
    .select(`
      *,
      resource:resources (
        id, name, description, url, logo_url, capabilities, type
      ),
      upgrade_paths (
        id,
        path_title,
        main_goal,
        slug
      )
    `)
    .eq("user_id", params.userId)
    .neq("status", "removed")

  if (pathResourcesError) {
    console.error("Error fetching path_resources:", pathResourcesError)
  }

  // Deduplicate resources
  const resourceMap: Record<string, {
    resource: any
    status: string
    paths: Array<{ id: string; title: string; slug: string }>
  }> = {}

  const statusPriority: Record<string, number> = {
    'added_paid': 6,
    'added_free': 5,
    'added_enrolled': 5,
    'added_completed': 6,
    'wishlisted': 3,
    'suggested': 2
  }

  ;(allPathResources || []).forEach((pr: any) => {
    const resourceId = pr.resource_id
    const resource = pr.resource
    const path = pr.upgrade_paths

    if (!resource || !resourceId) return

    if (!resourceMap[resourceId]) {
      resourceMap[resourceId] = {
        resource,
        status: pr.status,
        paths: []
      }
    }

    if (path) {
      const pathExists = resourceMap[resourceId].paths.some(p => p.id === path.id)
      if (!pathExists) {
        resourceMap[resourceId].paths.push({
          id: path.id,
          title: path.path_title || path.main_goal || "Untitled Path",
          slug: path.slug || path.id
        })
      }
    }

    const currentPriority = statusPriority[pr.status] || 0
    const existingPriority = statusPriority[resourceMap[resourceId].status] || 0
    if (currentPriority > existingPriority) {
      resourceMap[resourceId].status = pr.status
    }
  })

  const statusMap: Record<string, string> = {
    'added_paid': 'paying',
    'added_free': 'free_user',
    'added_enrolled': 'enrolled',
    'added_completed': 'completed',
    'wishlisted': 'wishlist',
    'suggested': 'suggested'
  }

  const stack = Object.values(resourceMap).map((item) => ({
    status: statusMap[item.status] || item.status,
    resource: item.resource,
    paths: item.paths
  }))

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, is_organization, organization_name, user_id")
    .eq("user_id", params.userId)
    .maybeSingle()
  
  // Check if viewing own profile
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  const isOwner = currentUser?.id === params.userId

  // Fetch the latest path's role from upgrade_paths
  const { data: latestPath } = await supabase
    .from('upgrade_paths')
    .select('role')
    .eq('user_id', params.userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (stack.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <h1 className="text-2xl font-bold">Empty Stack 📭</h1>
        <p className="text-gray-500 mb-6">This user hasn't curated their AI stack yet.</p>
        <Link href="/" className="bg-black text-white px-4 py-2 rounded-md text-sm">
          Generate My Stack
        </Link>
      </div>
    )
  }

  // Simple grouping
  const paying = stack.filter((i: any) => i.status === 'paying')
  const free = stack.filter((i: any) => i.status === 'free_user')
  const other = stack.filter((i: any) => i.status !== 'paying' && i.status !== 'free_user')

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold mb-2">
          {latestPath?.role || "Human"}'s AI Stack
        </h1>
        {isOwner && (
          <p className="text-green-600 text-sm font-medium bg-green-50 inline-block px-3 py-1 rounded-full border border-green-100">
            ✅ You are viewing your public page
          </p>
        )}
      </div>

      <div className="space-y-8">
        <TierSection title="💸 Essential (Paying)" items={paying} isOwner={isOwner} />
        <TierSection title="⚡ Daily Drivers (Free)" items={free} isOwner={isOwner} />
        <TierSection title="Other / Wishlist" items={other} isOwner={isOwner} />
      </div>
    </div>
  )
}

function TierSection({ title, items, isOwner }: any) {
  if (items.length === 0) return null
  return (
    <div className="p-6 bg-white border rounded-xl shadow-sm">
      <h3 className="text-lg font-bold mb-4 border-b pb-2">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item: any) => (
          <div key={item.resource.id} className="p-4 border rounded-lg hover:bg-gray-50 transition">
            <div className="flex justify-between items-start mb-2">
              <span className="font-semibold">{item.resource.name}</span>
              {/* This enables editing directly from the public page if you are the owner */}
              {isOwner && <div className="scale-90 origin-top-right"><StackManager resourceId={item.resource.id} initialStatus={item.status} /></div>}
            </div>
            <p className="text-sm text-gray-500 line-clamp-2">{item.resource.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
