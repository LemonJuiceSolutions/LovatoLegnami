import { notFound } from "next/navigation"
import { PRICE_LIST_SECTIONS, type PriceListSectionSlug } from "@/components/admin/admin-nav"
import { ListinoPage } from "@/components/admin/listino/listino-page"
import { editableDocument } from "@/server/admin/overview"
import { requireAdminPage } from "@/server/admin/page-guard"
import { can } from "@/server/auth"

export const dynamic = "force-dynamic"

const isSection = (s: string): s is PriceListSectionSlug => PRICE_LIST_SECTIONS.some((x) => x.slug === s)

export default async function ListinoSectionPage({ params }: { params: { sezione: string } }) {
  const user = await requireAdminPage(["listino:scrivi", "listino-tecnico:scrivi"], `/admin/listino/${params.sezione}`)
  if (!isSection(params.sezione)) notFound()
  const { status, data } = await editableDocument("listino")
  if (!data) return <p className="text-sm text-muted-foreground">Nessun listino in archivio: esegui il seed del database.</p>
  return (
    <ListinoPage
      section={params.sezione}
      status={status}
      priceList={data}
      canCommercial={can(user, "listino:scrivi")}
      canTechnical={can(user, "listino-tecnico:scrivi")}
    />
  )
}
