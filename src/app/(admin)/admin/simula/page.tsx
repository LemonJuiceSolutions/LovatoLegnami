import { Simulator } from "@/components/admin/simula/simulator"
import { requireAdminPage } from "@/server/admin/page-guard"
import { presetsOrCatalog } from "@/server/admin/publish-checks"
import { getActive, getDraft } from "@/server/repositories/datasets"
import { list as listLeads } from "@/server/repositories/leads"

export const dynamic = "force-dynamic"

export default async function AdminSimulaPage() {
  await requireAdminPage(["listino:scrivi", "listino-tecnico:scrivi"], "/admin/simula")
  const [draft, active, presetVersion, leads] = await Promise.all([getDraft("listino"), getActive("listino"), getActive("preset"), listLeads({ pageSize: 50 })])
  const pl = (draft ?? active)?.data
  if (!pl) return <p className="text-sm text-muted-foreground">Nessun listino in archivio: esegui il seed del database.</p>
  const opt = (xs: readonly { id: string; label: string }[]) => xs.map((x) => ({ value: x.id, label: x.label }))
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Simula preventivo</h1>
      <p className="text-sm text-muted-foreground">
        {draft ? `Confronto tra la bozza v${draft.version} e la versione attiva del listino.` : "Nessuna bozza del listino: il simulatore mostra solo la versione attiva."}
      </p>
      <Simulator
        presets={presetsOrCatalog(presetVersion?.data).map((p) => ({ value: p.id, label: p.name }))}
        leads={leads.items.map((l) => ({ value: l.id, label: `${l.code} – ${l.customerName ?? ""} (${l.status})` }))}
        species={opt(pl.timber.species)}
        qualities={opt(pl.timber.qualities)}
        treatments={opt(pl.treatments)}
        coverings={opt(pl.coverings)}
      />
    </div>
  )
}
