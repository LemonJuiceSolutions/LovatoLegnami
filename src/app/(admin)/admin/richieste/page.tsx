import { LeadsList } from "@/components/admin/richieste/leads-list"
import { LEAD_STATUSES, type LeadStatus } from "@/db/schema"
import { leadRows } from "@/server/admin/leads-view"
import { requireAdminPage } from "@/server/admin/page-guard"

export const dynamic = "force-dynamic"

export default async function AdminRichiestePage({ searchParams }: { searchParams: { status?: string; q?: string; page?: string } }) {
  await requireAdminPage(["richieste:leggi"], "/admin/richieste")
  const status = (LEAD_STATUSES as readonly string[]).includes(searchParams.status ?? "") ? (searchParams.status as LeadStatus) : undefined
  const q = (searchParams.q ?? "").slice(0, 100)
  const page = Math.max(1, Math.min(10_000, Number.parseInt(searchParams.page ?? "1", 10) || 1))
  const res = await leadRows({ status, q, page })
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Richieste</h1>
      <LeadsList items={res.items} total={res.total} page={res.page} pageSize={res.pageSize} status={status ?? ""} q={q} />
    </div>
  )
}
