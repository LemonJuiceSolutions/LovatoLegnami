"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { User } from "lucide-react"

export function NavHeader() {
  const pathname = usePathname()
  const title = pathname.split("/").filter(Boolean)[0]?.toUpperCase() ?? ""

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-3 pl-10 md:pl-0">
        <span className="text-sm font-semibold text-muted-foreground">{title}</span>
      </div>

      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <User className="h-4 w-4" />
      </div>
    </header>
  )
}
