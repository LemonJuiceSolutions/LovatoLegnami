"use client"

import * as React from "react"
import { selectAssembly } from "@/stores/configuratore-store"
import { useConfiguratore } from "@/stores/use-configuratore"
import { Scene } from "./scene"
import { FAMILY_COLORS, FAMILY_LABELS } from "./theme-colors"
import { familyLegend } from "./viewer-helpers"
import { useViewerPalette } from "./use-viewer-palette"

/** Riquadro sovrapposto alla scena con lo stile delle card del tema. */
export function Overlay({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={
        "pointer-events-auto rounded-md border bg-background/90 text-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75 " +
        (className ?? "")
      }
    >
      {children}
    </div>
  )
}

function Legend() {
  const assembly = useConfiguratore(selectAssembly)
  const entries = React.useMemo(() => familyLegend(assembly), [assembly])
  if (entries.length === 0) return null
  return (
    <Overlay className="px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
      <ul className="space-y-0.5 text-xs" aria-label="Legenda famiglie">
        {entries.map((e) => (
          <li key={e.family} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm border" style={{ backgroundColor: FAMILY_COLORS[e.family] }} />
            <span className="flex-1">{FAMILY_LABELS[e.family]}</span>
            <span className="tabular-nums text-muted-foreground">{e.count}</span>
          </li>
        ))}
      </ul>
    </Overlay>
  )
}

/** Visualizzatore 3D completo: scena r3f e controlli sovrapposti (componenti shadcn). */
export default function Viewer() {
  const assembly = useConfiguratore(selectAssembly)
  const envelope = useConfiguratore((s) => s.config.envelope)
  const palette = useViewerPalette()

  return (
    <div data-slot="viewer" className="relative h-full w-full overflow-hidden rounded-lg border bg-background">
      <Scene assembly={assembly} envelope={envelope} palette={palette} />
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[45%]">
        <Legend />
      </div>
    </div>
  )
}
