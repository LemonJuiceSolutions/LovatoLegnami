import { UsersAdmin } from "@/components/admin/utenti/users-admin"
import { formatDateTime } from "@/server/admin/overview"
import { requireAdminPage } from "@/server/admin/page-guard"
import { isRole, type Role } from "@/server/auth/permissions"
import { list } from "@/server/repositories/users"

export const dynamic = "force-dynamic"

/** Utenti (9.10): solo amministratori (`utenti:gestisci`), gli altri ricevono 404. */
export default async function AdminUtentiPage() {
  const user = await requireAdminPage(["utenti:gestisci"], "/admin/utenti")
  const users = (await list()).filter((u) => isRole(u.role))
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Utenti</h1>
      <p className="text-sm text-muted-foreground">Solo gli utenti in questo elenco possono accedere all&apos;area interna, con il collegamento ricevuto via email.</p>
      <UsersAdmin
        currentUserId={user.id}
        users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role as Role, active: u.active, createdAt: formatDateTime(u.createdAt) }))}
      />
    </div>
  )
}
