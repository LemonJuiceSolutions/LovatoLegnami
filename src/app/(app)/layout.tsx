"use client"

import * as React from "react"
import { QueryProvider } from "@/components/providers/query-provider"
import { Sidebar } from "@/components/layout/sidebar"
import { NavHeader } from "@/components/layout/nav-header"
import { AiAssistant } from "@/components/ai/ai-assistant"

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const [aiPanelOpen, setAiPanelOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setAiPanelOpen(!!detail?.open)
    }
    window.addEventListener("base-ai-panel-toggle", handler)
    return () => window.removeEventListener("base-ai-panel-toggle", handler)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden relative">
      <Sidebar />
      <div className={`flex flex-1 flex-col overflow-hidden relative z-10 transition-all duration-300 ${aiPanelOpen ? "mr-[400px]" : ""}`}>
        <NavHeader />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative z-10">{children}</main>
      </div>
      <AiAssistant />
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </QueryProvider>
  )
}
