"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/**
 * Slot del visualizzatore 3D (sezione 12, spec `visualizzatore-3d`).
 *
 * - È montato una sola volta, dentro un contenitore `relative` già
 *   dimensionato, che riempie con `h-full w-full`.
 * - Il visualizzatore (`viewer/viewer.tsx`: canvas r3f e controlli) è caricato
 *   con `next/dynamic(..., { ssr: false })`, così Three non entra nel bundle
 *   server né nelle altre pagine.
 * - I dati arrivano dallo store (`useConfiguratore`): assieme, risultati del
 *   kernel, collisioni/violazioni, ingombro e selezione condivisa con il
 *   pannello esiti.
 */
const Viewer = dynamic(() => import("./viewer/viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center gap-2 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Caricamento del visualizzatore 3D...
    </div>
  ),
})

export function ViewerSlot() {
  return (
    <div className="absolute inset-0">
      <Viewer />
    </div>
  )
}
