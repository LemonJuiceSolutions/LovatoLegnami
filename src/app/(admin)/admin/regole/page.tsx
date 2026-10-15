import { RegolePage } from "@/components/admin/regole/regole-page"
import { editableDocument } from "@/server/admin/overview"
import { requireAdminPage } from "@/server/admin/page-guard"
import { can } from "@/server/auth"

export const dynamic = "force-dynamic"

export default async function AdminRegolePage() {
  const user = await requireAdminPage(["regole:scrivi"], "/admin/regole")
  const { status, data } = await editableDocument("regole")
  if (!data) return <p className="text-sm text-muted-foreground">Nessun set di regole in archivio: esegui il seed del database.</p>
  return <RegolePage status={status} ruleSet={data} canWrite={can(user, "regole:scrivi")} />
}
