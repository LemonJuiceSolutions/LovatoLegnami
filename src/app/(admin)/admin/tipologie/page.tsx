import { TipologiePage } from "@/components/admin/siti/site-pages"
import { editableDocument } from "@/server/admin/overview"
import { requireAdminPage } from "@/server/admin/page-guard"
import { presetsOrCatalog } from "@/server/admin/publish-checks"
import { startingPrice } from "@/server/admin/starting-price"
import { can } from "@/server/auth"
import { getActive } from "@/server/repositories/datasets"

export const dynamic = "force-dynamic"

export default async function AdminTipologiePage() {
  const user = await requireAdminPage(["tipologie:scrivi"], "/admin/tipologie")
  const [{ status, data }, listino, presetVersion, regole] = await Promise.all([editableDocument("tipologie"), getActive("listino"), getActive("preset"), getActive("regole")])
  if (!data) return <p className="text-sm text-muted-foreground">Nessuna impostazione delle tipologie in archivio: esegui il seed del database.</p>
  const presets = presetsOrCatalog(presetVersion?.data)
  const startingPrices: Record<string, string> = {}
  if (listino) {
    const version = { id: listino.id, version: listino.version, effectiveFrom: listino.effectiveFrom, status: "attiva" as const }
    for (const id of new Set(data.map((t) => t.referencePresetId).filter((v): v is string => !!v))) {
      const preset = presets.find((p) => p.id === id)
      const price = preset && startingPrice(preset, listino.data, version, regole?.data)
      if (price) startingPrices[id] = price.label
    }
  }
  return (
    <TipologiePage
      status={status}
      settings={data}
      presets={presets.map((p) => ({ id: p.id, name: p.name, typologySlug: p.typologySlug }))}
      startingPrices={startingPrices}
      canWrite={can(user, "tipologie:scrivi")}
    />
  )
}
