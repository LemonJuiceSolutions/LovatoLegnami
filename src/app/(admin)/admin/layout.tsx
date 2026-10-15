import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { AdminSubnav } from "@/components/admin/admin-subnav"
import { canAccessAdmin } from "@/components/admin/admin-nav"
import { requirePageUser } from "@/server/auth"
import { PATH_HEADER } from "@/server/auth/route-guard"

export const dynamic = "force-dynamic"
export const metadata = { title: "Admin – Lovato Legnami", robots: { index: false, follow: false } }

/** Area admin (P10): stesso guscio dell'app interna, con la sotto-navigazione delle sezioni. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(undefined, headers().get(PATH_HEADER) ?? "/admin")
  if (!canAccessAdmin(user)) notFound()
  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }}>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminSubnav user={{ role: user.role }} />
        {children}
      </div>
    </AppShell>
  )
}
