import { getUserStack } from "@/actions/get-stack"
import { createClient } from "@/utils/supabase/server"
import StackManager from "@/components/stack-manager"
import ShareStackButton from "@/components/share-stack-button"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import AddToolSearch from "@/components/add-tool-search"
import { BookOpen, Wrench, GraduationCap, CheckCircle2, Clock, ListTodo } from "lucide-react"
import { Metadata } from "next"
import ResourceIcon from "@/components/resource-icon"

interface PageProps {
  params: Promise<{ userId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { userId } = await params
  
  // Fetch user profile simply to get their name/role
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_role")
    .eq("user_id", userId)
    .single()

  const title = `${profile?.current_role || "Founder"}'s AI Stack`
  const description = "Check out my curated list of AI tools and learning resources."

  return {
    title: title,
    description: description,
    openGraph: {
      title: title,
      description: description,
      type: "website",
      // images: ['/default-stack-image.jpg'] // Optional: Add a default image in your public folder
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
    }
  }
}

export default async function PublicStackPage({ params }: PageProps) {
  // 1. Setup & Fetch
  const { userId } = await params
  const data = await getUserStack(userId)
  const stack = data?.stack || []
  const profile = data?.profile
  
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  const isOwner = currentUser?.id === userId

  // 2. Handle Empty State
  if (stack.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h1 className="text-2xl font-bold mb-4">Empty Stack 📭</h1>
        <p className="text-zinc-500 mb-6">This user hasn't curated their AI stack yet.</p>
        <Link href="/">
          <Button>Generate My Stack</Button>
        </Link>
      </div>
    )
  }

  // --- 3. SEPARATE & GROUP DATA ---
  
  // Split into Arrays
// 1. Strict Filter for Courses (Matches 'human_course' exactly)
const courses = stack.filter((i: any) => i.resource.type === 'human_course')
// 2. Everything else is a Tool (Matches 'ai_tool', null, or anything else)
const tools = stack.filter((i: any) => i.resource.type !== 'human_course')

  // Group Tools
  const payingTools = tools.filter((i: any) => i.status === 'paying')
  const freeTools = tools.filter((i: any) => i.status === 'free_user')
  const wishlistTools = tools.filter((i: any) => i.status === 'wishlist')
  const churnedTools = tools.filter((i: any) => i.status === 'churned')

  // Group Courses
  const enrolledCourses = courses.filter((i: any) => i.status === 'enrolled')
  const completedCourses = courses.filter((i: any) => i.status === 'completed')
  const todoCourses = courses.filter((i: any) => i.status === 'todo')

  return (
    <div id="stack-capture" className="max-w-4xl mx-auto py-12 px-4">
      
      {/* HEADER */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold mb-2">
          {profile?.current_role || "Founder"}'s Stack
        </h1>
        
        {isOwner && (
          <>
            <div className="hide-on-export mt-4 flex flex-col items-center gap-2">
              <span className="text-green-600 text-xs font-medium bg-green-50 px-3 py-1 rounded-full border border-green-100">
                ✅ You are viewing your public page
              </span>
            </div>

            <div className="flex justify-center gap-3 mt-6 mb-10">
              <ShareStackButton userId={userId} userName={profile?.current_role || "User"} />
              <Link href="/">
                <Button variant="outline" className="rounded-full">+ New Path</Button>
              </Link>
            </div>
            
            <div className="mb-10">
               <AddToolSearch userId={userId} />
            </div>
          </>
        )}
      </div>

      <div className="space-y-20">
        
        {/* --- SECTION 1: AI TOOLS --- */}
        {tools.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-8 border-b pb-4">
              <Wrench className="w-6 h-6 text-zinc-400" />
              <h2 className="text-2xl font-bold text-zinc-900">AI Tool Arsenal</h2>
            </div>
            
            <div className="space-y-8">
              <TierSection title="💸 Essential (Paying)" items={payingTools} isOwner={isOwner} />
              <TierSection title="⚡ Daily Drivers (Free)" items={freeTools} isOwner={isOwner} />
              <TierSection title="🔖 Wishlist" items={wishlistTools} isOwner={isOwner} />
              {isOwner && <TierSection title="💀 Churned" items={churnedTools} isOwner={isOwner} />}
            </div>
          </section>
        )}

        {/* --- SECTION 2: KNOWLEDGE BASE --- */}
        {courses.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-8 border-b pb-4">
              <GraduationCap className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-zinc-900">Knowledge Base</h2>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              {/* In Progress */}
              {enrolledCourses.length > 0 && (
                <CourseGroup 
                  title="📖 In Progress" 
                  items={enrolledCourses} 
                  isOwner={isOwner} 
                  icon={<Clock className="w-4 h-4 text-blue-600" />}
                  colorClass="border-blue-200 bg-blue-50/50"
                />
              )}

              {/* Completed */}
              {completedCourses.length > 0 && (
                <CourseGroup 
                  title="🎓 Completed" 
                  items={completedCourses} 
                  isOwner={isOwner} 
                  icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  colorClass="border-emerald-200 bg-emerald-50/50"
                />
              )}

              {/* To Do */}
              {todoCourses.length > 0 && (
                <CourseGroup 
                  title="📋 To Do List" 
                  items={todoCourses} 
                  isOwner={isOwner} 
                  icon={<ListTodo className="w-4 h-4 text-gray-500" />}
                  colorClass="border-gray-200 bg-gray-50/50"
                />
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

// --- SUB-COMPONENT 1: TOOLS (Standard Tier List) ---
function TierSection({ title, items, isOwner }: any) {
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
        {items.map((item: any) => (
          
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
              {isOwner && (
                <div className="absolute top-4 right-4 scale-90 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <StackManager resourceId={item.resource.id} initialStatus={item.status} isCourse={false} />
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 line-clamp-2 mb-2">{item.resource.description}</p>
            {(
               <a href={item.resource.url} target="_blank" className="text-[10px] text-blue-600 hover:underline block">
                 View Tool →
               </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// --- SUB-COMPONENT 2: COURSES (New Grouping Style) ---
function CourseGroup({ title, items, isOwner, icon, colorClass }: any) {
  return (
    <div className={`p-6 rounded-xl border ${colorClass}`}>
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-zinc-800">
        {icon} {title}
        <span className="text-xs bg-white border border-zinc-200 px-2 py-0.5 rounded-full text-zinc-500 font-normal ml-auto">
          {items.length} Items
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item: any) => (
          <div key={item.resource.id} className="bg-white p-4 rounded-lg border border-zinc-200/60 shadow-sm flex flex-col h-full">
            <div className="shrink-0">
                 <ResourceIcon 
                   url={item.resource.url}
                   logo_url={item.resource.logo_url}
                   name={item.resource.name}
                   className="w-16 h-16 rounded object-contain"
                 />
              </div>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                
                <span className="font-bold text-sm text-zinc-900">{item.resource.name}</span>
              </div>
              
              {/* 👇 This is the magic prop: isCourse={true} */}
              {isOwner && (
                <div className="scale-90 origin-top-right">
                  <StackManager 
                    resourceId={item.resource.id} 
                    initialStatus={item.status} 
                    isCourse={true} 
                  />
                </div>
              )}
            </div>
            
            <p className="text-xs text-zinc-500 mb-3 line-clamp-2">
              {item.resource.description}
            </p>
            
            {!isOwner && (
              <div className="mt-auto pt-2 border-t border-zinc-50">
                <a href={item.resource.url} target="_blank" className="text-xs font-semibold text-blue-600 hover:underline">
                  Start Learning →
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}