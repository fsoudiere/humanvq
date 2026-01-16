import { getUserStack } from "@/actions/get_stack"
import { createClient } from "@/utils/supabase/server"
import StackManager from "@/components/stack-manager"
import Link from "next/link"

export default async function PublicStackPage({ params }: { params: { userId: string } }) {
  const data = await getUserStack(params.userId)
  const stack = data?.stack || []
  const profile = data?.profile
  
  // Check if viewing own profile
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  const isOwner = currentUser?.id === params.userId

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
          {profile?.current_role || "Founder"}'s AI Stack
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