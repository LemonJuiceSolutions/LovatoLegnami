import { PresetPage } from "@/components/admin/siti/site-pages"
import { listTypologies } from "@/domain"
import { editableDocument } from "@/server/admin/overview"
import { requireAdminPage } from "@/server/admin/page-guard"
import { can } from "@/server/auth"

export const dynamic = "force-dynamic"

export default async function AdminPresetPage() {
  const user = await requireAdminPage(["preset:scrivi"], "/admin/preset")
  const { status, data } = await editableDocument("preset")
  if (!data) return <p className="text-sm text-muted-foreground">Nessun preset in archivio: esegui il seed del database.</p>
  const typologyTitles = Object.fromEntries(listTypologies().map((t) => [t.slug, t.name]))
  return <PresetPage status={status} presets={data} typologyTitles={typologyTitles} canWrite={can(user, "preset:scrivi")} />
}
