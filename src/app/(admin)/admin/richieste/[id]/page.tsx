import { notFound } from "next/navigation"
import { LeadDetail } from "@/components/admin/richieste/lead-detail"
import { leadDetailView } from "@/server/admin/leads-view"
import { requireAdminPage } from "@/server/admin/page-guard"
import { can } from "@/server/auth"
import { NotFoundError } from "@/server/repositories/errors"

export const dynamic = "force-dynamic"

export default async function AdminRichiestaPage({ params }: { params: { id: string } }) {
  const user = await requireAdminPage(["richieste:leggi"], `/admin/richieste/${params.id}`)
  let lead
  try {
    lead = await leadDetailView(params.id)
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    throw e
  }
  return <LeadDetail lead={lead} canManage={can(user, "richieste:gestisci")} canErase={can(user, "dati:cancella")} currentUserId={user.id} />
}
