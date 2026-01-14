"use client"

import Link from "next/link"
import StackManager from "@/components/stack-manager"
import { Card } from "@/components/ui/card"

interface ResourceItem {
  id?: string;
  title: string;
  description: string;
  url?: string;
  capabilities?: string[];
}

interface UpgradePathData {
  ai_tools?: ResourceItem[];
}

interface ResultsViewProps {
  upgradeData: UpgradePathData | null;
}

export default function ResultsView({ upgradeData }: ResultsViewProps) {
  return (
    <>
    <div className="flex justify-end mb-6">
    <Link href="/stack/me" className="text-sm font-medium text-blue-600 hover:underline">
      View My Public Stack → 
    </Link>
  </div>
      {upgradeData?.ai_tools?.map((tool: ResourceItem, i: number) => (
        <Card key={i} className="...">
          {/* ... existing card content ... */}
          
          {/* 👇 ADD THIS AT THE BOTTOM OF THE CARD CONTENT */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
            {tool.id && <StackManager resourceId={tool.id} />}
          </div>
        </Card>
      ))}
    </>
  )
}