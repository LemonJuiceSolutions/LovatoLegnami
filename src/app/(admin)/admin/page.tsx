import { AdminOverview } from "@/components/admin/admin-overview"
import { canAccessAdmin } from "@/components/admin/admin-nav"
import { DATASETS } from "@/db/schema"
import { datasetStatus, newLeadsCount } from "@/server/admin/overview"
import { requireAdminPage } from "@/server/admin/page-guard"
import { can, PERMISSIONS } from "@/server/auth"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AdminHomePage() {
  const user = await requireAdminPage(PERMISSIONS, "/admin")
  if (!canAccessAdmin(user)) notFound()
  const [datasets, newLeads] = await Promise.all([Promise.all(DATASETS.map((d) => datasetStatus(d))), can(user, "richieste:leggi") ? newLeadsCount() : null])
  return <AdminOverview user={{ role: user.role }} datasets={datasets} newLeads={newLeads} />
}
