"use client"

import { useRouter } from "next/navigation"
import { DiffList } from "../diff-list"
import { DATASET_LABELS, type DatasetName, type DiffItem } from "../types"

/**
 * Registro delle modifiche (9.10, spec `listini-versionati`): voci dalla più recente con
 * utente, data, insieme di dati, azione e differenza espandibile; filtri per insieme e
 * utente nell'indirizzo. Sola lettura: l'interfaccia non offre alcuna modifica.
 */

export interface AuditEntryView {
  readonly id: number
  readonly at: string
  readonly user: string | null
  readonly dataset: DatasetName | null
  readonly entity: string
  readonly entityId: string
  readonly action: string
  readonly diff: readonly DiffItem[]
}

const ACTION_LABELS: Readonly<Record<string, string>> = {
  crea: "creazione",
  salva: "salvataggio",
  pubblica: "pubblicazione",
  archivia: "archiviazione",
  importa: "import CSV",
  cancella: "cancellazione",
  "cambia-stato": "cambio di stato",
  assegna: "assegnazione",
  "preventivo-definitivo": "preventivo definitivo",
  anonimizza: "anonimizzazione",
  "crea-utente": "nuovo utente",
  "attiva-utente": "utente attivato",
  "disattiva-utente": "utente disattivato",
  "cambia-ruolo": "cambio di ruolo",
  "imposta-password": "password impostata",
  "cambia-password": "password cambiata",
}

const ENTITY_LABELS: Readonly<Record<string, string>> = { dataset_version: "versione", lead: "richiesta", user: "utente" }

export function AuditLog({
  entries,
  users,
  dataset,
  userId,
  onNavigate,
}: {
  entries: readonly AuditEntryView[]
  users: readonly { id: string; label: string }[]
  dataset: string
  userId: string
  onNavigate?: (href: string) => void
}) {
  const router = useRouter()
  const go = onNavigate ?? ((href: string) => router.push(href))
  const href = (d: string, u: string) => {
    const sp = new URLSearchParams()
    if (d) sp.set("dataset", d)
    if (u) sp.set("utente", u)
    const qs = sp.toString()
    return `/admin/registro${qs ? `?${qs}` : ""}`
  }
  const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm"
  return (
    <div className="space-y-3">
      <div role="search" aria-label="Filtra il registro" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Insieme di dati</span>
          <select className={selectClass} value={dataset} onChange={(e) => go(href(e.target.value, userId))}>
            <option value="">tutti</option>
            {(Object.keys(DATASET_LABELS) as DatasetName[]).map((d) => (
              <option key={d} value={d}>
                {DATASET_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Utente</span>
          <select className={selectClass} value={userId} onChange={(e) => go(href(dataset, e.target.value))}>
            <option value="">tutti</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-sm text-muted-foreground">{entries.length === 1 ? "1 voce" : `${entries.length} voci`} (le più recenti)</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna voce.</p>
      ) : (
        <ol className="space-y-2" aria-label="Voci del registro">
          {entries.map((e) => (
            <li key={e.id} className="rounded-md border p-2 text-sm">
              <details>
                <summary className="cursor-pointer">
                  <span className="text-muted-foreground">{e.at}</span> · <strong>{e.user ?? "sistema"}</strong> · {ACTION_LABELS[e.action] ?? e.action}
                  {e.dataset ? ` · ${DATASET_LABELS[e.dataset]}` : ` · ${ENTITY_LABELS[e.entity] ?? e.entity}`}
                  {e.diff.length > 0 && <span className="text-muted-foreground"> · {e.diff.length === 1 ? "1 campo" : `${e.diff.length} campi`}</span>}
                </summary>
                <div className="mt-2 space-y-1">
                  <p className="font-mono text-xs text-muted-foreground">
                    {ENTITY_LABELS[e.entity] ?? e.entity} {e.entityId}
                  </p>
                  {e.diff.length ? <DiffList diff={e.diff} /> : <p className="text-xs text-muted-foreground">Nessuna differenza registrata.</p>}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
