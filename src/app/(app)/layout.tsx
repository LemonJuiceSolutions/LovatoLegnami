import type { Metadata } from "next"
import { headers } from "next/headers"
import { AppShell } from "@/components/layout/app-shell"
import { requirePageUser } from "@/server/auth"
import { PATH_HEADER } from "@/server/auth/route-guard"

// L'utente è riletto dal database a ogni richiesta (disattivazione immediata).
export const dynamic = "force-dynamic"

// Area interna: mai indicizzata (11.5).
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("configuratore:usa", headers().get(PATH_HEADER) ?? "/dashboard")
  return <AppShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</AppShell>
}
