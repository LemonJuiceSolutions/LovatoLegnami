import { AuditLog } from "@/components/admin/registro/audit-log"
import { DATASETS, type Dataset } from "@/db/schema"
import { formatDateTime } from "@/server/admin/overview"
import { requireAdminPage } from "@/server/admin/page-guard"
import { list as listAudit } from "@/server/repositories/audit"
import { list as listUsers } from "@/server/repositories/users"

export const dynamic = "force-dynamic"

export default async function AdminRegistroPage({ searchParams }: { searchParams: { dataset?: string; utente?: string } }) {
  await requireAdminPage(["listino:scrivi", "listino-tecnico:scrivi", "regole:scrivi", "tipologie:scrivi", "preset:scrivi", "utenti:gestisci"], "/admin/registro")
  const dataset = (DATASETS as readonly string[]).includes(searchParams.dataset ?? "") ? (searchParams.dataset as Dataset) : undefined
  const users = await listUsers()
  const userId = users.some((u) => u.id === searchParams.utente) ? searchParams.utente : undefined
  const entries = await listAudit({ dataset, userId, limit: 200 })
  const label = new Map(users.map((u) => [u.id, u.name ?? u.email]))
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Registro modifiche</h1>
      <AuditLog
        dataset={dataset ?? ""}
        userId={userId ?? ""}
        users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
        entries={entries.map((e) => ({
          id: e.id,
          at: formatDateTime(e.at),
          user: e.userId ? (label.get(e.userId) ?? null) : null,
          dataset: e.dataset,
          entity: e.entity,
          entityId: e.entityId,
          action: e.action,
          diff: e.diff.slice(0, 300),
        }))}
      />
    </div>
  )
}
