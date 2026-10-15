"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { Actor } from "@/server/auth/permissions"
import { adminSectionsFor } from "./admin-nav"

/** Sotto-navigazione a schede dell'area admin: solo le sezioni accessibili all'utente. */
export function AdminSubnav({ user }: { user: Actor }) {
  const pathname = usePathname() ?? "/admin"
  const sections = adminSectionsFor(user)
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="Sezioni admin" className="flex gap-1 overflow-x-auto border-b pb-2">
      {tab("/admin", "Riepilogo", pathname === "/admin")}
      {sections.map((s) => tab(s.href, s.label, pathname === s.href || pathname.startsWith(`${s.href}/`)))}
    </nav>
  )
}
