"use client"

import * as React from "react"
import { Box } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { selectAssembly } from "@/stores/configuratore-store"
import { useConfiguratore } from "@/stores/use-configuratore"

/**
 * SLOT DEL VISUALIZZATORE 3D (placeholder, sezione 12 di `tasks.md`).
 *
 * Contratto per la sezione 12:
 * - questo componente è montato una sola volta, dentro un contenitore
 *   `relative` che ha già altezza e larghezza (riempirlo con `h-full w-full`);
 * - il canvas r3f va caricato con `next/dynamic(..., { ssr: false })` da qui
 *   (o sostituendo il corpo di `ViewerSlot`), così Three non entra nel bundle
 *   server né nelle altre pagine;
 * - i dati arrivano dallo store (`useConfiguratore`): `selectAssembly`,
 *   `s.kernel` (status, results, building), `s.derived.collisions` /
 *   `selectErrors` per l'evidenziazione, `s.config.envelope` per ingombro,
 *   ostacoli e pavimento, `s.selection` / `s.selectPieces(ids)` per la
 *   selezione condivisa con il pannello esiti.
 */
export function ViewerSlot() {
  const assembly = useConfiguratore(selectAssembly)
  const pieces = assembly?.pieces.length ?? 0

  return (
    <div
      data-slot="viewer"
      className="flex h-full w-full items-center justify-center rounded-lg border border-dashed bg-muted/30"
    >
      <EmptyState
        icon={Box}
        title="Visualizzatore 3D"
        description={
          pieces > 0
            ? `Anteprima 3D in arrivo: l'assieme corrente ha ${pieces} pezzi.`
            : "Anteprima 3D in arrivo."
        }
      />
    </div>
  )
}
